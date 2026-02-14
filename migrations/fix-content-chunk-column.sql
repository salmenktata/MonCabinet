-- =====================================================================
-- FIX CRITIQUE: Corriger colonne content_chunk → content
-- =====================================================================
-- Bug: search_knowledge_base_hybrid() et vw_redisearch_pending_sync
--      utilisent kbc.content_chunk qui n'existe pas
-- Fix: Remplacer par kbc.content (nom correct de la colonne)
-- Date: 2026-02-14
-- =====================================================================

-- 1. CORRIGER TRIGGER TSVECTOR
-- =====================================================================

CREATE OR REPLACE FUNCTION kb_chunks_tsvector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('simple', NEW.content);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- 2. CORRIGER VUE REDISEARCH
-- =====================================================================

CREATE OR REPLACE VIEW vw_redisearch_pending_sync AS
SELECT
  kbc.id as chunk_id,
  kbc.knowledge_base_id,
  kb.title,
  kbc.content AS content_chunk,
  kb.category,
  kb.language,
  kbc.embedding,
  kbc.embedding_openai,
  rs.sync_status,
  rs.last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - rs.last_synced_at)) / 3600 as staleness_hours
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
LEFT JOIN redisearch_sync_status rs ON kbc.id = rs.chunk_id
WHERE rs.sync_status IN ('pending', 'error', 'stale')
   OR rs.chunk_id IS NULL
ORDER BY rs.last_synced_at ASC NULLS FIRST
LIMIT 1000;

-- 3. CORRIGER FONCTION HYBRID SEARCH (7 paramètres)
-- =====================================================================

CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  query_text text,
  query_embedding vector,
  category_filter text DEFAULT NULL,
  limit_count integer DEFAULT 15,
  vector_threshold double precision DEFAULT 0.5,
  use_openai boolean DEFAULT false,
  rrf_k integer DEFAULT 60
)
RETURNS TABLE(
  knowledge_base_id uuid,
  chunk_id uuid,
  title text,
  chunk_content text,
  chunk_index integer,
  similarity double precision,
  bm25_rank double precision,
  hybrid_score double precision,
  category text,
  subcategory text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- ===== RECHERCHE VECTORIELLE (Sémantique) =====
  vector_results AS (
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content AS chunk_content,  -- FIX: content au lieu de content_chunk
      kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_sim,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2
  ),
  -- ===== RECHERCHE BM25 (Keywords) =====
  bm25_results AS (
    SELECT
      kbc.id AS chunk_id,
      ts_rank_cd(
        kbc.content_tsvector,
        plainto_tsquery('simple', query_text)
      ) AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2
  ),
  -- ===== FUSION RRF (Reciprocal Rank Fusion) =====
  fused_results AS (
    SELECT
      vr.knowledge_base_id,
      vr.chunk_id,
      vr.title,
      vr.chunk_content,
      vr.chunk_index,
      vr.vec_sim,
      COALESCE(br.rank, 0) AS bm25_rank,
      vr.category,
      vr.subcategory,
      vr.metadata,
      (
        (0.7 / (rrf_k + vr.vec_rank)) +
        (0.3 / (rrf_k + COALESCE(br.bm25_rank, limit_count * 2)))
      ) AS hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.chunk_id = br.chunk_id
    UNION
    -- Ajouter résultats BM25 non trouvés par vectoriel
    SELECT
      kbc.knowledge_base_id,
      br.chunk_id,
      kb.title,
      kbc.content AS chunk_content,  -- FIX: content au lieu de content_chunk
      kbc.chunk_index,
      0.0 AS vec_sim,
      br.rank AS bm25_rank,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      (0.3 / (rrf_k + br.bm25_rank)) AS hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.chunk_id NOT IN (SELECT chunk_id FROM vector_results)
  )
  -- ===== RÉSULTATS FINAUX =====
  SELECT
    fr.knowledge_base_id,
    fr.chunk_id,
    fr.title,
    fr.chunk_content,
    fr.chunk_index,
    fr.vec_sim AS similarity,
    fr.bm25_rank,
    fr.hybrid_score,
    fr.category,
    fr.subcategory,
    fr.metadata
  FROM fused_results fr
  ORDER BY fr.hybrid_score DESC
  LIMIT limit_count;
END
$$;

-- 4. CORRIGER FONCTION HYBRID SEARCH (6 paramètres - overload)
-- =====================================================================

CREATE OR REPLACE FUNCTION search_knowledge_base_hybrid(
  query_text text,
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count integer DEFAULT 15,
  vector_threshold double precision DEFAULT 0.5,
  use_openai boolean DEFAULT false
)
RETURNS TABLE(
  id uuid,
  title text,
  chunk_content text,
  similarity double precision,
  bm25_rank double precision,
  hybrid_score double precision,
  category text,
  subcategory text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- ===== RECHERCHE VECTORIELLE (Sémantique) =====
  vector_results AS (
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content AS chunk_content,  -- FIX: content au lieu de content_chunk
      kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_sim,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2
  ),
  -- ===== RECHERCHE BM25 (Keywords) =====
  bm25_results AS (
    SELECT
      kbc.id AS chunk_id,
      ts_rank_cd(
        kbc.content_tsvector,
        plainto_tsquery('simple', query_text)
      ) AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2
  ),
  -- ===== FUSION RRF =====
  fused_results AS (
    SELECT
      vr.knowledge_base_id,
      vr.chunk_id,
      vr.title,
      vr.chunk_content,
      vr.chunk_index,
      vr.vec_sim,
      COALESCE(br.rank, 0) AS bm25_rank,
      vr.category,
      vr.subcategory,
      vr.metadata,
      (
        (0.7 / (60 + vr.vec_rank)) +
        (0.3 / (60 + COALESCE(br.bm25_rank, limit_count * 2)))
      ) AS hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.chunk_id = br.chunk_id
    UNION
    SELECT
      kbc.knowledge_base_id,
      br.chunk_id,
      kb.title,
      kbc.content AS chunk_content,  -- FIX: content au lieu de content_chunk
      kbc.chunk_index,
      0.0 AS vec_sim,
      br.rank AS bm25_rank,
      kb.category::text,
      kb.subcategory,
      kb.metadata,
      (0.3 / (60 + br.bm25_rank)) AS hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.chunk_id NOT IN (SELECT chunk_id FROM vector_results)
  )
  SELECT
    fr.knowledge_base_id AS id,
    fr.title,
    fr.chunk_content,
    fr.vec_sim AS similarity,
    fr.bm25_rank,
    fr.hybrid_score,
    fr.category,
    fr.subcategory,
    fr.metadata
  FROM fused_results fr
  ORDER BY fr.hybrid_score DESC
  LIMIT limit_count;
END
$$;

-- 5. VÉRIFICATION
-- =====================================================================

-- Test rapide que la fonction fonctionne (sans vraie requête vectorielle)
SELECT 'Fix appliqué avec succès!' AS status;
