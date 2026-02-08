-- ============================================================================
-- Migration: Métadonnées Structurées pour Knowledge Base
-- Date: 2026-02-09
-- Description: Ajoute tables pour métadonnées juridiques structurées et graphe de connaissances
-- ============================================================================

-- ============================================================================
-- TABLE : MÉTADONNÉES STRUCTURÉES VALIDÉES
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_structured_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE UNIQUE,

  -- Métadonnées communes
  document_date DATE,
  document_number TEXT,
  title_official TEXT,
  language VARCHAR(5) CHECK (language IN ('ar', 'fr', 'bi')),

  -- Jurisprudence (FK vers taxonomie)
  tribunal_code TEXT REFERENCES legal_taxonomy(code),
  chambre_code TEXT REFERENCES legal_taxonomy(code),
  decision_number TEXT,
  decision_date DATE,
  parties JSONB,  -- {appellant: "...", appellee: "...", ...}
  solution TEXT CHECK (solution IN ('cassation', 'rejet', 'renvoi', 'confirmation', 'infirmation', 'autre')),
  legal_basis TEXT[],  -- Articles de loi appliqués : ["Art. 1 COC", "Art. 242 CPC"]
  rapporteur TEXT,

  -- Législation
  loi_number TEXT,
  jort_number TEXT,
  jort_date DATE,
  effective_date DATE,
  ministry TEXT,
  code_name TEXT,  -- "مجلة الالتزامات والعقود"
  article_range TEXT,  -- "1-100"

  -- Doctrine
  author TEXT,
  co_authors TEXT[],
  publication_name TEXT,
  publication_date DATE,
  university TEXT,
  keywords TEXT[],
  abstract TEXT,

  -- Confiance par champ (JSON : {"tribunal": 0.95, "decision_date": 0.88, ...})
  field_confidence JSONB DEFAULT '{}'::jsonb,

  -- Extraction
  extraction_method TEXT CHECK (extraction_method IN ('llm', 'regex', 'hybrid', 'manual')),
  extraction_confidence FLOAT CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  llm_provider TEXT,
  llm_model TEXT,

  -- Validation
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,
  validation_notes TEXT,

  -- Audit
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  version INTEGER DEFAULT 1,

  CONSTRAINT check_tribunal_chambre_coherent CHECK (
    (tribunal_code IS NULL AND chambre_code IS NULL) OR
    (tribunal_code IS NOT NULL)
  )
);

-- Index pour recherche par critères juridiques
CREATE INDEX IF NOT EXISTS idx_kb_meta_tribunal ON kb_structured_metadata(tribunal_code) WHERE tribunal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_meta_chambre ON kb_structured_metadata(chambre_code) WHERE chambre_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_meta_decision_date ON kb_structured_metadata(decision_date) WHERE decision_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_meta_document_date ON kb_structured_metadata(document_date) WHERE document_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_meta_extraction_confidence ON kb_structured_metadata(extraction_confidence);
CREATE INDEX IF NOT EXISTS idx_kb_meta_language ON kb_structured_metadata(language) WHERE language IS NOT NULL;

-- ============================================================================
-- TABLE : GRAPHE DE CONNAISSANCES JURIDIQUES
-- ============================================================================

CREATE TABLE IF NOT EXISTS kb_legal_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kb_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  target_kb_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,

  -- Type de relation juridique
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'cites',              -- Document A cite Document B
    'cited_by',           -- Document A cité par B (inverse)
    'supersedes',         -- Document A remplace/abroge B
    'superseded_by',      -- Document A remplacé par B
    'implements',         -- Arrêt A applique loi B
    'interpreted_by',     -- Loi A interprétée par juris B
    'commented_by',       -- Décision A commentée par doctrine B
    'related_case',       -- Jurisprudences similaires
    'same_topic',         -- Même sujet juridique
    'contradicts'         -- Contradiction juridique
  )),

  -- Contexte de la relation
  context TEXT,  -- Extrait montrant la relation
  confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),

  -- Extraction
  extracted_method TEXT CHECK (extracted_method IN ('llm', 'regex', 'manual')),
  extracted_by UUID REFERENCES users(id),

  -- Validation
  validated BOOLEAN DEFAULT false,
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source_kb_id, target_kb_id, relation_type),
  CHECK (source_kb_id != target_kb_id)  -- Pas d'auto-référence
);

CREATE INDEX IF NOT EXISTS idx_kb_relations_source ON kb_legal_relations(source_kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_target ON kb_legal_relations(target_kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_relations_type ON kb_legal_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_kb_relations_validated ON kb_legal_relations(validated) WHERE validated = false;

-- ============================================================================
-- AJOUT FK TAXONOMIE À KNOWLEDGE_BASE
-- ============================================================================

ALTER TABLE knowledge_base
  ADD COLUMN IF NOT EXISTS taxonomy_category_code TEXT REFERENCES legal_taxonomy(code),
  ADD COLUMN IF NOT EXISTS taxonomy_domain_code TEXT REFERENCES legal_taxonomy(code),
  ADD COLUMN IF NOT EXISTS taxonomy_document_type_code TEXT REFERENCES legal_taxonomy(code);

CREATE INDEX IF NOT EXISTS idx_kb_taxonomy_category ON knowledge_base(taxonomy_category_code)
  WHERE taxonomy_category_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_taxonomy_domain ON knowledge_base(taxonomy_domain_code)
  WHERE taxonomy_domain_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kb_taxonomy_doc_type ON knowledge_base(taxonomy_document_type_code)
  WHERE taxonomy_document_type_code IS NOT NULL;

-- ============================================================================
-- TRIGGER : MISE À JOUR AUTOMATIQUE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_kb_metadata_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_kb_metadata_updated_at
  BEFORE UPDATE ON kb_structured_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_kb_metadata_updated_at();

-- ============================================================================
-- FONCTION : RECHERCHE AVEC FILTRES JURIDIQUES
-- ============================================================================

CREATE OR REPLACE FUNCTION search_kb_with_legal_filters(
  p_embedding vector(1024),
  p_similarity_threshold FLOAT DEFAULT 0.65,
  p_limit INTEGER DEFAULT 10,
  p_tribunal_code TEXT DEFAULT NULL,
  p_chambre_code TEXT DEFAULT NULL,
  p_domain_code TEXT DEFAULT NULL,
  p_doc_type_code TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to DATE DEFAULT NULL,
  p_language VARCHAR(5) DEFAULT NULL,
  p_min_confidence FLOAT DEFAULT NULL
)
RETURNS TABLE (
  kb_id UUID,
  title TEXT,
  category TEXT,
  similarity FLOAT,
  -- Métadonnées structurées
  tribunal_code TEXT,
  tribunal_label_ar TEXT,
  tribunal_label_fr TEXT,
  chambre_code TEXT,
  chambre_label_ar TEXT,
  chambre_label_fr TEXT,
  decision_date DATE,
  decision_number TEXT,
  legal_basis TEXT[],
  extraction_confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS kb_id,
    kb.title,
    kb.category,
    (1 - (kb_emb.embedding <=> p_embedding))::FLOAT AS similarity,
    -- Métadonnées structurées
    meta.tribunal_code,
    trib_tax.label_ar AS tribunal_label_ar,
    trib_tax.label_fr AS tribunal_label_fr,
    meta.chambre_code,
    chambre_tax.label_ar AS chambre_label_ar,
    chambre_tax.label_fr AS chambre_label_fr,
    meta.decision_date,
    meta.decision_number,
    meta.legal_basis,
    meta.extraction_confidence
  FROM knowledge_base kb
  INNER JOIN kb_embeddings kb_emb ON kb.id = kb_emb.knowledge_base_id
  LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
  LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
  LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
  WHERE
    kb.is_indexed = true
    AND (1 - (kb_emb.embedding <=> p_embedding)) >= p_similarity_threshold
    -- Filtres juridiques
    AND (p_tribunal_code IS NULL OR meta.tribunal_code = p_tribunal_code)
    AND (p_chambre_code IS NULL OR meta.chambre_code = p_chambre_code)
    AND (p_domain_code IS NULL OR kb.taxonomy_domain_code = p_domain_code)
    AND (p_doc_type_code IS NULL OR kb.taxonomy_document_type_code = p_doc_type_code)
    AND (p_date_from IS NULL OR meta.decision_date >= p_date_from OR meta.document_date >= p_date_from)
    AND (p_date_to IS NULL OR meta.decision_date <= p_date_to OR meta.document_date <= p_date_to)
    AND (p_language IS NULL OR meta.language = p_language OR meta.language = 'bi')
    AND (p_min_confidence IS NULL OR meta.extraction_confidence >= p_min_confidence)
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FONCTION : OBTENIR RELATIONS JURIDIQUES D'UN DOCUMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION get_legal_relations(
  p_kb_id UUID,
  p_relation_types TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  relation_id UUID,
  relation_type TEXT,
  related_kb_id UUID,
  related_title TEXT,
  related_category TEXT,
  context TEXT,
  confidence FLOAT,
  direction TEXT  -- 'outgoing' ou 'incoming'
) AS $$
BEGIN
  RETURN QUERY
  -- Relations sortantes (ce document vers d'autres)
  SELECT
    rel.id AS relation_id,
    rel.relation_type,
    rel.target_kb_id AS related_kb_id,
    kb.title AS related_title,
    kb.category AS related_category,
    rel.context,
    rel.confidence,
    'outgoing'::TEXT AS direction
  FROM kb_legal_relations rel
  INNER JOIN knowledge_base kb ON rel.target_kb_id = kb.id
  WHERE
    rel.source_kb_id = p_kb_id
    AND (p_relation_types IS NULL OR rel.relation_type = ANY(p_relation_types))
    AND rel.validated = true

  UNION ALL

  -- Relations entrantes (autres documents vers ce document)
  SELECT
    rel.id AS relation_id,
    rel.relation_type,
    rel.source_kb_id AS related_kb_id,
    kb.title AS related_title,
    kb.category AS related_category,
    rel.context,
    rel.confidence,
    'incoming'::TEXT AS direction
  FROM kb_legal_relations rel
  INNER JOIN knowledge_base kb ON rel.source_kb_id = kb.id
  WHERE
    rel.target_kb_id = p_kb_id
    AND (p_relation_types IS NULL OR rel.relation_type = ANY(p_relation_types))
    AND rel.validated = true

  ORDER BY confidence DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VUES UTILES
-- ============================================================================

-- Vue: Documents KB avec métadonnées enrichies
CREATE OR REPLACE VIEW vw_kb_with_metadata AS
SELECT
  kb.id,
  kb.title,
  kb.category,
  kb.source_type,
  kb.file_size,
  kb.is_indexed,
  kb.indexed_at,
  -- Métadonnées structurées
  meta.document_date,
  meta.document_number,
  meta.title_official,
  meta.language,
  meta.tribunal_code,
  trib_tax.label_ar AS tribunal_label_ar,
  trib_tax.label_fr AS tribunal_label_fr,
  meta.chambre_code,
  chambre_tax.label_ar AS chambre_label_ar,
  chambre_tax.label_fr AS chambre_label_fr,
  meta.decision_date,
  meta.decision_number,
  meta.solution,
  meta.legal_basis,
  meta.extraction_confidence,
  meta.extraction_method,
  meta.validated_by,
  meta.validated_at,
  -- Compteurs relations
  (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = kb.id AND validated = true) AS relations_outgoing_count,
  (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = kb.id AND validated = true) AS relations_incoming_count
FROM knowledge_base kb
LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code;

-- Vue: Statistiques extraction métadonnées
CREATE OR REPLACE VIEW vw_metadata_extraction_stats AS
SELECT
  COUNT(*) AS total_documents,
  COUNT(meta.id) AS documents_with_metadata,
  ROUND(COUNT(meta.id)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS coverage_percent,
  AVG(meta.extraction_confidence) AS avg_confidence,
  COUNT(*) FILTER (WHERE meta.extraction_method = 'llm') AS extracted_llm,
  COUNT(*) FILTER (WHERE meta.extraction_method = 'regex') AS extracted_regex,
  COUNT(*) FILTER (WHERE meta.extraction_method = 'hybrid') AS extracted_hybrid,
  COUNT(*) FILTER (WHERE meta.extraction_method = 'manual') AS extracted_manual,
  COUNT(*) FILTER (WHERE meta.validated_by IS NOT NULL) AS validated_count
FROM knowledge_base kb
LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
WHERE kb.is_indexed = true;

-- Vue: Statistiques relations juridiques
CREATE OR REPLACE VIEW vw_legal_relations_stats AS
SELECT
  COUNT(*) AS total_relations,
  COUNT(*) FILTER (WHERE validated = true) AS validated_relations,
  COUNT(*) FILTER (WHERE validated = false) AS pending_validation,
  relation_type,
  COUNT(*) AS count_by_type,
  AVG(confidence) AS avg_confidence_by_type
FROM kb_legal_relations
GROUP BY relation_type
ORDER BY count_by_type DESC;

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================

COMMENT ON TABLE kb_structured_metadata IS 'Métadonnées juridiques structurées extraites des documents KB avec validation et versioning';
COMMENT ON TABLE kb_legal_relations IS 'Graphe de connaissances juridiques : relations entre documents (citations, abrogations, etc.)';
COMMENT ON COLUMN kb_structured_metadata.field_confidence IS 'Score de confiance par champ extrait (JSON) : {"tribunal": 0.95, "date": 0.88}';
COMMENT ON COLUMN kb_structured_metadata.extraction_method IS 'Méthode d''extraction utilisée : llm, regex, hybrid, ou manual';
COMMENT ON COLUMN kb_structured_metadata.version IS 'Version des métadonnées (auto-incrémentée à chaque UPDATE)';
COMMENT ON COLUMN kb_legal_relations.relation_type IS 'Type de relation juridique : cites, supersedes, implements, contradicts, etc.';
COMMENT ON COLUMN kb_legal_relations.context IS 'Extrait du document montrant la relation (citation, référence)';
COMMENT ON FUNCTION search_kb_with_legal_filters IS 'Recherche sémantique KB avec filtres juridiques (tribunal, chambre, date, domaine)';
COMMENT ON FUNCTION get_legal_relations IS 'Obtient toutes les relations juridiques d''un document KB (entrantes et sortantes)';

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
