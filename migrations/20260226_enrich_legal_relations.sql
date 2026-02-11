-- ============================================================================
-- Migration: Enrichissement Relations Juridiques (Phase 4.1)
-- Date: 2026-02-26
-- Description: Ajoute nouveaux types relations + PageRank pour jurisprudence tunisienne
-- ============================================================================

-- ============================================================================
-- AJOUT NOUVEAUX TYPES DE RELATIONS JURIDIQUES TUNISIENNES
-- ============================================================================

-- Supprimer ancienne contrainte CHECK sur relation_type
ALTER TABLE kb_legal_relations DROP CONSTRAINT IF EXISTS kb_legal_relations_relation_type_check;

-- Recréer contrainte avec nouveaux types tunisiens
ALTER TABLE kb_legal_relations ADD CONSTRAINT kb_legal_relations_relation_type_check
  CHECK (relation_type IN (
    -- Types existants
    'cites',              -- Document A cite Document B (يشير إلى)
    'cited_by',           -- Document A cité par B (مشار إليه من)
    'supersedes',         -- Document A remplace/abroge B (يلغي)
    'superseded_by',      -- Document A remplacé par B (ملغى من)
    'implements',         -- Arrêt A applique loi B (يطبق)
    'interpreted_by',     -- Loi A interprétée par juris B (مفسر من)
    'commented_by',       -- Décision A commentée par doctrine B (معلق عليه من)
    'related_case',       -- Jurisprudences similaires (قضايا مشابهة)
    'same_topic',         -- Même sujet juridique (نفس الموضوع)
    'contradicts',        -- Contradiction juridique (يناقض)

    -- Nouveaux types Phase 4 (Tunisie)
    'confirms',           -- Confirmation jurisprudence (يؤكد)
    'overrules',          -- Revirement jurisprudentiel - نقض (renverse position antérieure)
    'distinguishes',      -- Distinction/précision - تمييز (distingue cas sans renverser)
    'applies',            -- Application règle de droit (يطبق القاعدة)
    'interprets'          -- Interprétation texte juridique (يفسر)
  ));

-- ============================================================================
-- COLONNE PRECEDENT_VALUE POUR PAGERANK (Phase 4.4)
-- ============================================================================

-- Score d'importance calculé par PageRank (0-1)
-- Arrêts Cour de Cassation tunisienne avec score élevé = jurisprudence fondatrice
ALTER TABLE kb_structured_metadata
  ADD COLUMN IF NOT EXISTS precedent_value FLOAT DEFAULT 0.0
  CHECK (precedent_value >= 0 AND precedent_value <= 1);

-- Index pour tri par importance
CREATE INDEX IF NOT EXISTS idx_kb_meta_precedent_value
  ON kb_structured_metadata(precedent_value DESC)
  WHERE precedent_value > 0;

-- ============================================================================
-- COLONNE RELATION_STRENGTH (optionnel, alias pour confidence)
-- ============================================================================

-- Alias pour clarté sémantique (force de la relation 0-1)
-- Note: On utilise déjà 'confidence', mais on peut ajouter un alias si besoin
-- ALTER TABLE kb_legal_relations ADD COLUMN relation_strength FLOAT;
-- UPDATE kb_legal_relations SET relation_strength = confidence;

COMMENT ON COLUMN kb_legal_relations.confidence IS
  'Force de la relation juridique (0-1). Aussi appelée relation_strength.';

-- ============================================================================
-- INDEX POUR PERFORMANCE EXTRACTION RELATIONS
-- ============================================================================

-- Index composite pour graphe de citations (PageRank)
CREATE INDEX IF NOT EXISTS idx_kb_relations_graph
  ON kb_legal_relations(source_kb_id, target_kb_id, relation_type)
  WHERE validated = true;

-- Index pour timeline jurisprudentielle (filtrage par type + date)
CREATE INDEX IF NOT EXISTS idx_kb_relations_type_validated
  ON kb_legal_relations(relation_type, validated)
  WHERE validated = true;

-- ============================================================================
-- FONCTION: OBTENIR ARRÊTS CITANT UN DOCUMENT (pour PageRank)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_citing_documents(p_kb_id UUID)
RETURNS TABLE (
  citing_kb_id UUID,
  citing_title TEXT,
  citing_category TEXT,
  citing_tribunal TEXT,
  citing_date DATE,
  relation_type TEXT,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS citing_kb_id,
    kb.title AS citing_title,
    kb.category AS citing_category,
    meta.tribunal_code AS citing_tribunal,
    meta.decision_date AS citing_date,
    rel.relation_type,
    rel.confidence
  FROM kb_legal_relations rel
  INNER JOIN knowledge_base kb ON rel.source_kb_id = kb.id
  LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
  WHERE
    rel.target_kb_id = p_kb_id
    AND rel.validated = true
    AND rel.relation_type IN ('cites', 'confirms', 'applies', 'implements')
  ORDER BY meta.decision_date DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_citing_documents IS
  'Obtient tous les arrêts tunisiens citant un document donné (pour calcul PageRank)';

-- ============================================================================
-- FONCTION: OBTENIR ARRÊTS RENVERSÉS (overruled precedents)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_overruled_precedents(p_kb_id UUID)
RETURNS TABLE (
  overruled_kb_id UUID,
  overruled_title TEXT,
  overruled_date DATE,
  overruled_tribunal TEXT,
  overruling_date DATE,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id AS overruled_kb_id,
    kb.title AS overruled_title,
    meta.decision_date AS overruled_date,
    meta.tribunal_code AS overruled_tribunal,
    current_meta.decision_date AS overruling_date,
    rel.confidence
  FROM kb_legal_relations rel
  INNER JOIN knowledge_base kb ON rel.target_kb_id = kb.id
  LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
  LEFT JOIN kb_structured_metadata current_meta ON rel.source_kb_id = current_meta.knowledge_base_id
  WHERE
    rel.source_kb_id = p_kb_id
    AND rel.validated = true
    AND rel.relation_type = 'overrules'
  ORDER BY meta.decision_date DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_overruled_precedents IS
  'Obtient les précédents renversés (نقض) par un arrêt de la Cour de Cassation tunisienne';

-- ============================================================================
-- VUE: STATISTIQUES RELATIONS PAR TYPE (enrichie)
-- ============================================================================

DROP VIEW IF EXISTS vw_legal_relations_stats;

CREATE OR REPLACE VIEW vw_legal_relations_stats AS
SELECT
  relation_type,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE validated = true) AS validated_count,
  COUNT(*) FILTER (WHERE validated = false) AS pending_validation_count,
  ROUND(AVG(confidence)::NUMERIC, 3) AS avg_confidence,
  ROUND(MIN(confidence)::NUMERIC, 3) AS min_confidence,
  ROUND(MAX(confidence)::NUMERIC, 3) AS max_confidence,
  COUNT(DISTINCT source_kb_id) AS distinct_sources,
  COUNT(DISTINCT target_kb_id) AS distinct_targets
FROM kb_legal_relations
GROUP BY relation_type
ORDER BY validated_count DESC, total_count DESC;

COMMENT ON VIEW vw_legal_relations_stats IS
  'Statistiques détaillées par type de relation juridique tunisienne';

-- ============================================================================
-- VUE: TOP ARRÊTS TUNISIENS PAR CITATIONS
-- ============================================================================

CREATE OR REPLACE VIEW vw_top_precedents_tunisia AS
SELECT
  kb.id,
  kb.title,
  kb.category,
  meta.tribunal_code,
  trib_tax.label_fr AS tribunal_label,
  meta.decision_date,
  meta.decision_number,
  meta.solution,
  meta.precedent_value,
  -- Compteurs relations
  COUNT(*) FILTER (WHERE rel.relation_type = 'cited_by') AS cited_by_count,
  COUNT(*) FILTER (WHERE rel.relation_type = 'confirms') AS confirmed_by_count,
  COUNT(*) FILTER (WHERE rel.relation_type = 'overrules') AS overrules_count,
  COUNT(*) FILTER (WHERE rel.relation_type = 'distinguished') AS distinguished_count,
  -- Total citations
  COUNT(*) AS total_citations
FROM knowledge_base kb
LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
LEFT JOIN kb_legal_relations rel ON kb.id = rel.target_kb_id AND rel.validated = true
WHERE kb.category = 'jurisprudence'
GROUP BY
  kb.id, kb.title, kb.category, meta.tribunal_code,
  trib_tax.label_fr, meta.decision_date, meta.decision_number,
  meta.solution, meta.precedent_value
HAVING COUNT(*) > 0  -- Au moins 1 citation
ORDER BY
  meta.precedent_value DESC NULLS LAST,
  total_citations DESC,
  meta.decision_date DESC NULLS LAST
LIMIT 100;

COMMENT ON VIEW vw_top_precedents_tunisia IS
  'Top 100 arrêts tunisiens les plus cités et influents (par PageRank et citations)';

-- ============================================================================
-- VUE: TIMELINE JURISPRUDENTIELLE PAR DOMAINE
-- ============================================================================

CREATE OR REPLACE VIEW vw_jurisprudence_timeline AS
SELECT
  kb.id,
  kb.title,
  meta.decision_date,
  meta.decision_number,
  meta.tribunal_code,
  trib_tax.label_fr AS tribunal_label,
  meta.chambre_code,
  chambre_tax.label_fr AS chambre_label,
  meta.solution,
  kb.taxonomy_domain_code AS domain_code,
  domain_tax.label_fr AS domain_label,
  meta.precedent_value,
  -- Type événement jurisprudentiel
  CASE
    WHEN EXISTS (
      SELECT 1 FROM kb_legal_relations
      WHERE source_kb_id = kb.id AND relation_type = 'overrules' AND validated = true
    ) THEN 'major_shift'  -- Revirement (نقض)
    WHEN EXISTS (
      SELECT 1 FROM kb_legal_relations
      WHERE source_kb_id = kb.id AND relation_type = 'confirms' AND validated = true
    ) THEN 'confirmation'  -- Confirmation (تأكيد)
    WHEN EXISTS (
      SELECT 1 FROM kb_legal_relations
      WHERE source_kb_id = kb.id AND relation_type = 'distinguishes' AND validated = true
    ) THEN 'nuance'  -- Distinction (تمييز)
    ELSE 'standard'
  END AS event_type,
  -- Compteurs relations
  (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = kb.id AND validated = true) AS incoming_relations_count
FROM knowledge_base kb
LEFT JOIN kb_structured_metadata meta ON kb.id = meta.knowledge_base_id
LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
LEFT JOIN legal_taxonomy domain_tax ON kb.taxonomy_domain_code = domain_tax.code
WHERE
  kb.category = 'jurisprudence'
  AND meta.decision_date IS NOT NULL
ORDER BY meta.decision_date DESC, meta.precedent_value DESC NULLS LAST;

COMMENT ON VIEW vw_jurisprudence_timeline IS
  'Timeline complète jurisprudence tunisienne avec type événement (major_shift, confirmation, nuance)';

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================

COMMENT ON COLUMN kb_structured_metadata.precedent_value IS
  'Score d''importance calculé par PageRank (0-1). Arrêts Cour de Cassation tunisienne avec score élevé = jurisprudence fondatrice';

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
