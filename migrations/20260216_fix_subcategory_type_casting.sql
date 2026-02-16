-- =====================================================================
-- Migration: Fix Subcategory Type Casting
-- Date: 2026-02-16
-- Description: Corriger le typage subcategory dans les fonctions SQL
--   Problème: Table knowledge_base a subcategory VARCHAR(50)
--   Mais fonctions retournent subcategory TEXT
--   Solution: Cast explicite kb.subcategory::text
-- =====================================================================

-- 1. FIX search_knowledge_base_flexible (OpenAI/Ollama wrapper)
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
      kb.subcategory::text,  -- FIX: Cast explicite VARCHAR(50) → TEXT
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
      kb.subcategory::text,  -- FIX: Cast explicite VARCHAR(50) → TEXT
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

-- 2. FIX search_knowledge_base (legacy avec vector 1536)
-- =====================================================================

DROP FUNCTION IF EXISTS search_knowledge_base(vector, text, text, integer, double precision);
DROP FUNCTION IF EXISTS search_knowledge_base(vector(1536), text, text, integer, double precision);

CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1536),
  p_category TEXT DEFAULT NULL,
  p_subcategory TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  knowledge_base_id UUID,
  chunk_id UUID,
  title TEXT,
  category TEXT,
  subcategory TEXT,
  chunk_content TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB,
  tags TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id as knowledge_base_id,
    kbc.id as chunk_id,
    kb.title,
    kb.category,
    kb.subcategory::text,  -- FIX: Cast explicite VARCHAR(50) → TEXT
    kbc.content as chunk_content,
    kbc.chunk_index,
    (1 - (kbc.embedding <=> query_embedding))::FLOAT as similarity,
    kb.metadata,
    kb.tags
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_indexed = true
    AND kb.is_active = true
    AND kbc.embedding IS NOT NULL
    AND (p_category IS NULL OR kb.category = p_category)
    AND (p_subcategory IS NULL OR kb.subcategory = p_subcategory)
    AND (1 - (kbc.embedding <=> query_embedding)) >= p_threshold
  ORDER BY kbc.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 3. VÉRIFICATION
-- =====================================================================

SELECT 'Migration 20260216_fix_subcategory_type_casting appliquée avec succès!' AS status;

-- Test de typage (doit fonctionner sans erreur)
SELECT
  proname,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname IN ('search_knowledge_base_flexible', 'search_knowledge_base')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
