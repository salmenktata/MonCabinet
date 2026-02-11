-- Migration : Recherche Hybride BM25 + Dense (Phase 2.1)
-- Date : 2026-02-14
-- Description : Implémentation BM25 (sparse retrieval) pour recherche hybride

-- =============================================================================
-- ÉTAPE 1 : Activer extension pg_trgm (trigrams)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON EXTENSION pg_trgm IS
'Extension pour recherche full-text avec trigrams et similarité de texte';

-- =============================================================================
-- ÉTAPE 2 : Index GIN pour recherche BM25
-- =============================================================================

-- Index GIN sur kb_chunks.content pour recherche full-text
CREATE INDEX IF NOT EXISTS idx_kb_chunks_content_gin
ON kb_chunks USING GIN (to_tsvector('french', content));

COMMENT ON INDEX idx_kb_chunks_content_gin IS
'Index GIN pour recherche full-text BM25 sur chunks KB (langue française)';

-- Index GIN trigrams pour similarité texte
CREATE INDEX IF NOT EXISTS idx_kb_chunks_content_trgm
ON kb_chunks USING GIN (content gin_trgm_ops);

COMMENT ON INDEX idx_kb_chunks_content_trgm IS
'Index GIN trigrams pour recherche floue et similarité de texte';

-- Index combiné (category + language) pour filtrage rapide
CREATE INDEX IF NOT EXISTS idx_kb_chunks_category_language
ON kb_chunks (category, language)
WHERE category IS NOT NULL AND language IS NOT NULL;

-- =============================================================================
-- ÉTAPE 3 : Fonction BM25 Search (Okapi BM25)
-- =============================================================================

CREATE OR REPLACE FUNCTION bm25_search(
  query_text TEXT,
  p_category TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 20,
  k1 FLOAT DEFAULT 1.2,
  b FLOAT DEFAULT 0.75
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  category TEXT,
  language TEXT,
  bm25_score FLOAT,
  ts_rank FLOAT
) AS $$
DECLARE
  avg_doc_length FLOAT;
  total_docs INTEGER;
BEGIN
  -- Calculer longueur moyenne documents
  SELECT AVG(LENGTH(content))::FLOAT, COUNT(*)::INTEGER
  INTO avg_doc_length, total_docs
  FROM kb_chunks
  WHERE (p_category IS NULL OR category = p_category)
    AND (p_language IS NULL OR language = p_language);

  -- Recherche BM25
  RETURN QUERY
  WITH ranked_chunks AS (
    SELECT
      c.id,
      c.content,
      c.category,
      c.language,
      -- Score ts_rank standard (baseline)
      ts_rank(to_tsvector('french', c.content), plainto_tsquery('french', query_text)) as rank_score,
      -- Approximation BM25 via ts_rank + normalization
      (
        ts_rank(to_tsvector('french', c.content), plainto_tsquery('french', query_text)) *
        (k1 + 1) /
        (
          ts_rank(to_tsvector('french', c.content), plainto_tsquery('french', query_text)) +
          k1 * (1 - b + b * (LENGTH(c.content)::FLOAT / NULLIF(avg_doc_length, 0)))
        )
      ) as bm25_approx
    FROM kb_chunks c
    WHERE to_tsvector('french', c.content) @@ plainto_tsquery('french', query_text)
      AND (p_category IS NULL OR c.category = p_category)
      AND (p_language IS NULL OR c.language = p_language)
  )
  SELECT
    id as chunk_id,
    content,
    category,
    language,
    bm25_approx as bm25_score,
    rank_score as ts_rank
  FROM ranked_chunks
  ORDER BY bm25_approx DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION bm25_search(TEXT, TEXT, TEXT, INTEGER, FLOAT, FLOAT) IS
'Recherche BM25 (Okapi) sur kb_chunks avec filtres catégorie/langue';

-- =============================================================================
-- ÉTAPE 4 : Fonction Recherche Hybride (BM25 + Dense)
-- =============================================================================

CREATE OR REPLACE FUNCTION hybrid_search(
  query_text TEXT,
  query_embedding VECTOR(1024),
  p_category TEXT DEFAULT NULL,
  p_language TEXT DEFAULT NULL,
  bm25_limit INTEGER DEFAULT 20,
  dense_limit INTEGER DEFAULT 50,
  rrf_k INTEGER DEFAULT 60
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  category TEXT,
  language TEXT,
  bm25_score FLOAT,
  dense_score FLOAT,
  rrf_score FLOAT,
  hybrid_rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- BM25 sparse retrieval
  bm25_results AS (
    SELECT
      chunk_id,
      bm25_score,
      ROW_NUMBER() OVER (ORDER BY bm25_score DESC) as bm25_rank
    FROM bm25_search(query_text, p_category, p_language, bm25_limit)
  ),
  -- Dense vector retrieval
  dense_results AS (
    SELECT
      id as chunk_id,
      1 - (embedding <=> query_embedding) as similarity_score,
      ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding ASC) as dense_rank
    FROM kb_chunks
    WHERE (p_category IS NULL OR category = p_category)
      AND (p_language IS NULL OR language = p_language)
      AND embedding IS NOT NULL
    ORDER BY embedding <=> query_embedding ASC
    LIMIT dense_limit
  ),
  -- Reciprocal Rank Fusion (RRF)
  rrf_fusion AS (
    SELECT
      COALESCE(b.chunk_id, d.chunk_id) as chunk_id,
      COALESCE(b.bm25_score, 0) as bm25_score,
      COALESCE(d.similarity_score, 0) as dense_score,
      -- RRF formula: 1/(k + rank)
      (COALESCE(1.0 / (rrf_k + b.bm25_rank), 0) +
       COALESCE(1.0 / (rrf_k + d.dense_rank), 0)) as rrf_score
    FROM bm25_results b
    FULL OUTER JOIN dense_results d ON b.chunk_id = d.chunk_id
  )
  SELECT
    f.chunk_id,
    c.content,
    c.category,
    c.language,
    f.bm25_score,
    f.dense_score,
    f.rrf_score,
    ROW_NUMBER() OVER (ORDER BY f.rrf_score DESC)::INTEGER as hybrid_rank
  FROM rrf_fusion f
  INNER JOIN kb_chunks c ON f.chunk_id = c.id
  ORDER BY f.rrf_score DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION hybrid_search IS
'Recherche hybride BM25 + Dense avec fusion RRF (Reciprocal Rank Fusion)';

-- =============================================================================
-- ÉTAPE 5 : Vue matérialisée pour statistiques BM25
-- =============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_bm25_stats AS
SELECT
  COUNT(*) as total_chunks,
  AVG(LENGTH(content))::INTEGER as avg_length,
  MAX(LENGTH(content))::INTEGER as max_length,
  MIN(LENGTH(content))::INTEGER as min_length,
  COUNT(DISTINCT category) as num_categories,
  COUNT(DISTINCT language) as num_languages
FROM kb_chunks;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_bm25_stats_singleton
ON mv_bm25_stats ((1));

COMMENT ON MATERIALIZED VIEW mv_bm25_stats IS
'Statistiques corpus KB pour tuning BM25 (avg_length, k1, b)';

-- =============================================================================
-- ÉTAPE 6 : Tests unitaires SQL
-- =============================================================================

DO $$
DECLARE
  test_query TEXT := 'contrat vente immobilier';
  test_embedding VECTOR(1024);
  bm25_count INTEGER;
  hybrid_count INTEGER;
BEGIN
  RAISE NOTICE '=== TESTS BM25 + HYBRID SEARCH ===';

  -- Test 1: BM25 Search
  SELECT COUNT(*) INTO bm25_count
  FROM bm25_search(test_query, NULL, NULL, 10);

  RAISE NOTICE 'Test 1 BM25: % résultats pour query "%"', bm25_count, test_query;

  -- Test 2: Hybrid Search (nécessite embedding réel)
  -- NOTE: Remplacer par embedding réel en production
  test_embedding := (SELECT embedding FROM kb_chunks WHERE embedding IS NOT NULL LIMIT 1);

  IF test_embedding IS NOT NULL THEN
    SELECT COUNT(*) INTO hybrid_count
    FROM hybrid_search(test_query, test_embedding, NULL, NULL, 20, 50, 60);

    RAISE NOTICE 'Test 2 Hybrid: % résultats (BM25 + Dense)', hybrid_count;
  ELSE
    RAISE NOTICE 'Test 2 Hybrid: SKIP (aucun embedding en DB)';
  END IF;

  -- Test 3: Index GIN existe
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'idx_kb_chunks_content_gin'
  ) THEN
    RAISE NOTICE 'Test 3 Index: idx_kb_chunks_content_gin ✅';
  ELSE
    RAISE WARNING 'Test 3 Index: idx_kb_chunks_content_gin ❌ MANQUANT';
  END IF;

  RAISE NOTICE 'Tests terminés';
END $$;

-- =============================================================================
-- ROLLBACK (si nécessaire)
-- =============================================================================

-- Pour annuler cette migration :
/*
DROP MATERIALIZED VIEW IF EXISTS mv_bm25_stats;
DROP FUNCTION IF EXISTS hybrid_search;
DROP FUNCTION IF EXISTS bm25_search;
DROP INDEX IF EXISTS idx_kb_chunks_category_language;
DROP INDEX IF EXISTS idx_kb_chunks_content_trgm;
DROP INDEX IF EXISTS idx_kb_chunks_content_gin;
-- Note: Ne pas drop pg_trgm si utilisé ailleurs
*/
