-- =====================================================================
-- Migration: Approbation KB → Indexation RAG
-- Date: 2026-02-15
-- Description: Ajout du système d'approbation pour la base de connaissances.
--   Les documents doivent être approuvés par un admin pour apparaître dans le RAG.
-- =====================================================================

-- 1. COLONNES APPROBATION
-- =====================================================================

ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);

-- Index partiel pour recherche rapide des docs approuvés
CREATE INDEX IF NOT EXISTS idx_kb_approved ON knowledge_base(is_approved) WHERE is_approved = true;

-- TOUS les docs existants → en attente (choix utilisateur)
UPDATE knowledge_base SET is_approved = false WHERE is_approved IS NULL;

-- 2. MISE À JOUR search_knowledge_base_flexible (ajouter AND kb.is_approved = true)
-- =====================================================================

CREATE OR REPLACE FUNCTION search_knowledge_base_flexible(
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count int DEFAULT 5,
  threshold float DEFAULT 0.5,
  use_openai boolean DEFAULT false
)
RETURNS TABLE (
  knowledge_base_id uuid,
  chunk_id uuid,
  title text,
  chunk_content text,
  chunk_index int,
  similarity float,
  category text,
  subcategory text,
  metadata jsonb
) AS $$
BEGIN
  IF use_openai THEN
    RETURN QUERY
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      (1 - (kbc.embedding_openai <=> query_embedding)) AS similarity,
      kb.category::text,
      kb.subcategory,
      kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding_openai IS NOT NULL
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding_openai <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding_openai <=> query_embedding
    LIMIT limit_count;
  ELSE
    RETURN QUERY
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      (1 - (kbc.embedding <=> query_embedding)) AS similarity,
      kb.category::text,
      kb.subcategory,
      kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding IS NOT NULL
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding <=> query_embedding
    LIMIT limit_count;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. MISE À JOUR search_knowledge_base_hybrid - Overload 7 params (ajouter AND kb.is_approved = true)
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
  vector_results AS (
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS v_chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding))::double precision AS vec_sim,
      kb.category::text,
      kb.subcategory::text,
      kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2
  ),
  bm25_results AS (
    SELECT
      kbc.id AS b_chunk_id,
      ts_rank_cd(
        kbc.content_tsvector,
        plainto_tsquery('simple', query_text)
      )::double precision AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS b_bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2
  ),
  fused_results AS (
    SELECT
      vr.knowledge_base_id,
      vr.v_chunk_id AS f_chunk_id,
      vr.title,
      vr.chunk_content,
      vr.chunk_index,
      vr.vec_sim,
      COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
      vr.category,
      vr.subcategory,
      vr.metadata,
      (
        (0.7::double precision / (rrf_k + vr.vec_rank)::double precision) +
        (0.3::double precision / (rrf_k + COALESCE(br.b_bm25_rank, limit_count * 2))::double precision)
      ) AS f_hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
    UNION
    SELECT
      kbc.knowledge_base_id,
      br.b_chunk_id AS f_chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      0.0::double precision AS vec_sim,
      br.rank::double precision AS f_bm25_rank,
      kb.category::text,
      kb.subcategory::text,
      kb.metadata,
      (0.3::double precision / (rrf_k + br.b_bm25_rank)::double precision) AS f_hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.b_chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.b_chunk_id NOT IN (SELECT vr2.v_chunk_id FROM vector_results vr2)
  )
  SELECT
    fr.knowledge_base_id,
    fr.f_chunk_id AS chunk_id,
    fr.title,
    fr.chunk_content,
    fr.chunk_index,
    fr.vec_sim AS similarity,
    fr.f_bm25_rank AS bm25_rank,
    fr.f_hybrid_score AS hybrid_score,
    fr.category,
    fr.subcategory,
    fr.metadata
  FROM fused_results fr
  ORDER BY fr.f_hybrid_score DESC
  LIMIT limit_count;
END
$$;

-- 4. MISE À JOUR search_knowledge_base_hybrid - Overload 8 params avec subcategory (ajouter AND kb.is_approved = true)
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
  vector_results AS (
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS v_chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding))::double precision AS vec_sim,
      kb.category::text,
      kb.subcategory::text,
      kb.metadata,
      ROW_NUMBER() OVER (ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) AS vec_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END) IS NOT NULL
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)) >= vector_threshold
    ORDER BY (CASE WHEN use_openai THEN kbc.embedding_openai ELSE kbc.embedding END <=> query_embedding)
    LIMIT limit_count * 2
  ),
  bm25_results AS (
    SELECT
      kbc.id AS b_chunk_id,
      ts_rank_cd(
        kbc.content_tsvector,
        plainto_tsquery('simple', query_text)
      )::double precision AS rank,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(kbc.content_tsvector, plainto_tsquery('simple', query_text)) DESC) AS b_bm25_rank
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.content_tsvector @@ plainto_tsquery('simple', query_text)
      AND kb.is_active = true
      AND kb.is_approved = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
    ORDER BY rank DESC
    LIMIT limit_count * 2
  ),
  fused_results AS (
    SELECT
      vr.knowledge_base_id,
      vr.v_chunk_id AS f_chunk_id,
      vr.title,
      vr.chunk_content,
      vr.chunk_index,
      vr.vec_sim,
      COALESCE(br.rank, 0.0::double precision) AS f_bm25_rank,
      vr.category,
      vr.subcategory,
      vr.metadata,
      (
        (0.7::double precision / (60 + vr.vec_rank)::double precision) +
        (0.3::double precision / (60 + COALESCE(br.b_bm25_rank, limit_count * 2))::double precision)
      ) AS f_hybrid_score
    FROM vector_results vr
    LEFT JOIN bm25_results br ON vr.v_chunk_id = br.b_chunk_id
    UNION
    SELECT
      kbc.knowledge_base_id,
      br.b_chunk_id AS f_chunk_id,
      kb.title,
      kbc.content AS chunk_content,
      kbc.chunk_index,
      0.0::double precision AS vec_sim,
      br.rank::double precision AS f_bm25_rank,
      kb.category::text,
      kb.subcategory::text,
      kb.metadata,
      (0.3::double precision / (60 + br.b_bm25_rank)::double precision) AS f_hybrid_score
    FROM bm25_results br
    JOIN knowledge_base_chunks kbc ON br.b_chunk_id = kbc.id
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE br.b_chunk_id NOT IN (SELECT vr2.v_chunk_id FROM vector_results vr2)
  )
  SELECT
    fr.knowledge_base_id AS id,
    fr.title,
    fr.chunk_content,
    fr.vec_sim AS similarity,
    fr.f_bm25_rank AS bm25_rank,
    fr.f_hybrid_score AS hybrid_score,
    fr.category,
    fr.subcategory,
    fr.metadata
  FROM fused_results fr
  ORDER BY fr.f_hybrid_score DESC
  LIMIT limit_count;
END
$$;

-- 5. VÉRIFICATION
-- =====================================================================
SELECT 'Migration kb_approval appliquée avec succès!' AS status;
