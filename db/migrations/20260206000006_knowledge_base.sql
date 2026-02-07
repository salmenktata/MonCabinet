/**
 * Migration: Tables Base de Connaissances (Knowledge Base)
 * Date: 2026-02-06
 * Description: Créer les tables pour la base de connaissances juridique partagée
 *              - knowledge_base: Documents de référence (codes, jurisprudence, doctrine)
 *              - knowledge_base_chunks: Chunks pour recherche sémantique
 */

-- ============================================================================
-- TABLE KNOWLEDGE_BASE
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Classification
  category TEXT NOT NULL CHECK (category IN ('jurisprudence', 'code', 'doctrine', 'modele', 'autre')),
  title TEXT NOT NULL,
  description TEXT,

  -- Métadonnées spécifiques (flexibles via JSONB)
  -- Ex jurisprudence: {court, chamber, decision_number, decision_date, domain}
  -- Ex code: {code_name, article_range, version_date}
  -- Ex doctrine: {author, publication, date}
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Contenu
  source_file TEXT,        -- Chemin fichier source dans MinIO
  full_text TEXT,          -- Texte extrait complet

  -- Recherche sémantique (embedding du résumé/titre)
  embedding vector(1536),
  is_indexed BOOLEAN DEFAULT false,

  -- Admin
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche vectorielle sur knowledge_base (résumé)
CREATE INDEX IF NOT EXISTS idx_knowledge_base_vector
  ON knowledge_base
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Index pour filtrage par catégorie
CREATE INDEX IF NOT EXISTS idx_knowledge_base_category ON knowledge_base(category);

-- Index pour recherche full-text
CREATE INDEX IF NOT EXISTS idx_knowledge_base_fulltext
  ON knowledge_base
  USING gin(to_tsvector('french', COALESCE(title, '') || ' ' || COALESCE(description, '')));

-- Index pour statut d'indexation
CREATE INDEX IF NOT EXISTS idx_knowledge_base_indexed ON knowledge_base(is_indexed);

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE KNOWLEDGE_BASE_CHUNKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index HNSW pour recherche vectorielle sur les chunks
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_vector
  ON knowledge_base_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Index pour jointure avec knowledge_base
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_kb_id
  ON knowledge_base_chunks(knowledge_base_id);

-- Index composite pour récupération ordonnée des chunks
CREATE INDEX IF NOT EXISTS idx_knowledge_base_chunks_kb_index
  ON knowledge_base_chunks(knowledge_base_id, chunk_index);

-- ============================================================================
-- FONCTIONS DE RECHERCHE
-- ============================================================================

/**
 * Recherche sémantique dans la base de connaissances
 * Recherche dans les chunks pour une meilleure précision
 */
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  knowledge_base_id UUID,
  chunk_id UUID,
  title TEXT,
  category TEXT,
  chunk_content TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id as knowledge_base_id,
    kbc.id as chunk_id,
    kb.title,
    kb.category,
    kbc.content as chunk_content,
    kbc.chunk_index,
    (1 - (kbc.embedding <=> query_embedding))::FLOAT as similarity,
    kb.metadata
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_indexed = true
    AND kbc.embedding IS NOT NULL
    AND (p_category IS NULL OR kb.category = p_category)
    AND (1 - (kbc.embedding <=> query_embedding)) >= p_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Statistiques de la base de connaissances
 */
CREATE OR REPLACE FUNCTION get_knowledge_base_stats()
RETURNS TABLE (
  total_documents BIGINT,
  indexed_documents BIGINT,
  total_chunks BIGINT,
  by_category JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM knowledge_base) as total_documents,
    (SELECT COUNT(*) FROM knowledge_base WHERE is_indexed = true) as indexed_documents,
    (SELECT COUNT(*) FROM knowledge_base_chunks) as total_chunks,
    (
      SELECT jsonb_object_agg(category, cnt)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM knowledge_base
        GROUP BY category
      ) sub
    ) as by_category;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Tables Base de Connaissances créées avec succès!';
  RAISE NOTICE '📊 Tables: knowledge_base, knowledge_base_chunks';
  RAISE NOTICE '🔍 Index HNSW pour recherche vectorielle configuré';
  RAISE NOTICE '📝 Fonctions: search_knowledge_base, get_knowledge_base_stats';
END $$;
