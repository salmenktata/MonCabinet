/**
 * Migration: Table jurisprudence tunisienne
 * Date: 2026-02-06
 * Description: Structure pour stocker et indexer les décisions de la Cour de Cassation tunisienne
 */

-- ============================================================================
-- TABLE JURISPRUDENCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS jurisprudence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Métadonnées juridiques
  court TEXT NOT NULL, -- 'Cour Cassation', 'Cour Appel Tunis', 'Tribunal Première Instance', etc.
  chamber TEXT, -- 'Civile', 'Commerciale', 'Pénale', 'Sociale', 'Famille'
  decision_number TEXT NOT NULL,
  decision_date DATE,

  -- Classification
  domain TEXT NOT NULL CHECK (domain IN ('civil', 'commercial', 'famille', 'penal', 'administratif', 'social', 'foncier')),

  -- Contenu
  summary TEXT, -- Résumé de la décision
  full_text TEXT, -- Texte intégral

  -- Références
  articles_cited TEXT[], -- Ex: ['CSP Art. 31', 'COC Art. 245', 'CPC Art. 128']
  keywords TEXT[], -- Mots-clés pour recherche

  -- Embedding vectoriel pour recherche sémantique
  embedding vector(1536),

  -- Traçabilité
  source_file TEXT, -- Chemin vers le fichier source (PDF)
  source_url TEXT, -- URL source si disponible

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEX
-- ============================================================================

-- Index HNSW pour recherche vectorielle
CREATE INDEX IF NOT EXISTS idx_jurisprudence_embedding
  ON jurisprudence
  USING hnsw (embedding vector_cosine_ops);

-- Index pour filtrage
CREATE INDEX IF NOT EXISTS idx_jurisprudence_domain ON jurisprudence(domain);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_court ON jurisprudence(court);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_chamber ON jurisprudence(chamber);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_date ON jurisprudence(decision_date);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_decision_number ON jurisprudence(decision_number);

-- Index GIN pour recherche dans les tableaux
CREATE INDEX IF NOT EXISTS idx_jurisprudence_articles ON jurisprudence USING gin(articles_cited);
CREATE INDEX IF NOT EXISTS idx_jurisprudence_keywords ON jurisprudence USING gin(keywords);

-- Index full-text pour recherche textuelle
CREATE INDEX IF NOT EXISTS idx_jurisprudence_fulltext
  ON jurisprudence
  USING gin(to_tsvector('french', COALESCE(summary, '') || ' ' || COALESCE(full_text, '')));

-- Trigger pour updated_at
CREATE TRIGGER update_jurisprudence_updated_at
  BEFORE UPDATE ON jurisprudence
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FONCTIONS DE RECHERCHE JURISPRUDENCE
-- ============================================================================

-- Recherche sémantique dans la jurisprudence
CREATE OR REPLACE FUNCTION search_jurisprudence(
  query_embedding vector(1536),
  p_domain TEXT DEFAULT NULL,
  p_court TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  court TEXT,
  chamber TEXT,
  decision_number TEXT,
  decision_date DATE,
  domain TEXT,
  summary TEXT,
  articles_cited TEXT[],
  similarity FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.court,
    j.chamber,
    j.decision_number,
    j.decision_date,
    j.domain,
    j.summary,
    j.articles_cited,
    (1 - (j.embedding <=> query_embedding))::FLOAT as similarity
  FROM jurisprudence j
  WHERE j.embedding IS NOT NULL
    AND (p_domain IS NULL OR j.domain = p_domain)
    AND (p_court IS NULL OR j.court = p_court)
    AND (1 - (j.embedding <=> query_embedding)) >= p_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Recherche par articles de loi cités
CREATE OR REPLACE FUNCTION search_jurisprudence_by_article(
  p_article TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  court TEXT,
  decision_number TEXT,
  decision_date DATE,
  domain TEXT,
  summary TEXT,
  articles_cited TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    j.id,
    j.court,
    j.decision_number,
    j.decision_date,
    j.domain,
    j.summary,
    j.articles_cited
  FROM jurisprudence j
  WHERE p_article = ANY(j.articles_cited)
  ORDER BY j.decision_date DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE STATISTIQUES JURISPRUDENCE
-- ============================================================================

CREATE TABLE IF NOT EXISTS jurisprudence_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  total_decisions INTEGER DEFAULT 0,
  decisions_by_domain JSONB DEFAULT '{}'::jsonb,
  decisions_by_court JSONB DEFAULT '{}'::jsonb,
  last_import_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer une ligne par défaut pour les stats
INSERT INTO jurisprudence_stats (total_decisions, decisions_by_domain, decisions_by_court)
VALUES (0, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT DO NOTHING;

-- Fonction pour mettre à jour les stats
CREATE OR REPLACE FUNCTION update_jurisprudence_stats()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE jurisprudence_stats
  SET
    total_decisions = (SELECT COUNT(*) FROM jurisprudence),
    decisions_by_domain = (
      SELECT jsonb_object_agg(domain, count)
      FROM (SELECT domain, COUNT(*) as count FROM jurisprudence GROUP BY domain) sub
    ),
    decisions_by_court = (
      SELECT jsonb_object_agg(court, count)
      FROM (SELECT court, COUNT(*) as count FROM jurisprudence GROUP BY court) sub
    ),
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour mettre à jour les stats après insertion
CREATE TRIGGER trigger_update_jurisprudence_stats
  AFTER INSERT OR DELETE ON jurisprudence
  FOR EACH STATEMENT
  EXECUTE FUNCTION update_jurisprudence_stats();

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Table jurisprudence créée avec succès!';
  RAISE NOTICE '📚 Prête pour indexer la jurisprudence tunisienne';
  RAISE NOTICE '🔍 Index HNSW + GIN + Full-text configurés';
END $$;
