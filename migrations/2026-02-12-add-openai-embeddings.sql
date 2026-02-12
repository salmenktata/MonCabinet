-- Migration: Ajouter support OpenAI embeddings (1536 dimensions)
-- Date: 2026-02-12
-- Objectif: Améliorer qualité RAG avec OpenAI text-embedding-3-small
--
-- Impact: Scores similarité attendus 54-63% → 75-85%
-- Stratégie: Colonne séparée pour transition progressive (Ollama 1024-dim existant)

-- =============================================================================
-- 1. AJOUTER COLONNE EMBEDDING OPENAI
-- =============================================================================

-- Colonne embedding_openai pour les embeddings OpenAI (1536 dimensions)
-- Permet coexistence avec embedding Ollama (1024 dims) pendant la transition
ALTER TABLE knowledge_base_chunks
ADD COLUMN IF NOT EXISTS embedding_openai vector(1536);

-- Commentaire pour documentation
COMMENT ON COLUMN knowledge_base_chunks.embedding_openai IS
'Embedding OpenAI text-embedding-3-small (1536 dims) - Meilleure qualité que Ollama qwen3 (1024 dims)';

-- =============================================================================
-- 2. INDEX IVFFLAT POUR RECHERCHE VECTORIELLE OPENAI
-- =============================================================================

-- Index IVFFlat pour recherche rapide avec embeddings OpenAI
-- lists=100 optimal pour ~10K chunks (racine carrée de la taille)
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_openai_ivfflat
ON knowledge_base_chunks
USING ivfflat (embedding_openai vector_cosine_ops)
WITH (lists = 100);

-- =============================================================================
-- 3. FONCTION RECHERCHE FLEXIBLE (Ollama OU OpenAI)
-- =============================================================================

-- Fonction de recherche qui supporte les deux types d'embeddings
-- Paramètre use_openai détermine quelle colonne utiliser
CREATE OR REPLACE FUNCTION search_knowledge_base_flexible(
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count int DEFAULT 5,
  threshold float DEFAULT 0.5,
  use_openai boolean DEFAULT false  -- Flag pour choisir le provider
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
    -- ===== RECHERCHE AVEC EMBEDDING OPENAI (1536 dims) =====
    RETURN QUERY
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content_chunk AS chunk_content,
      kbc.chunk_index,
      (1 - (kbc.embedding_openai <=> query_embedding)) AS similarity,
      kb.category::text,
      kb.subcategory,
      kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding_openai IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding_openai <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding_openai <=> query_embedding
    LIMIT limit_count;
  ELSE
    -- ===== RECHERCHE AVEC EMBEDDING OLLAMA (1024 dims) =====
    RETURN QUERY
    SELECT
      kbc.knowledge_base_id,
      kbc.id AS chunk_id,
      kb.title,
      kbc.content_chunk AS chunk_content,
      kbc.chunk_index,
      (1 - (kbc.embedding <=> query_embedding)) AS similarity,
      kb.category::text,
      kb.subcategory,
      kb.metadata
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding IS NOT NULL
      AND kb.is_active = true
      AND (category_filter IS NULL OR kb.category::text = category_filter)
      AND (subcategory_filter IS NULL OR kb.subcategory = subcategory_filter)
      AND (1 - (kbc.embedding <=> query_embedding)) >= threshold
    ORDER BY kbc.embedding <=> query_embedding
    LIMIT limit_count;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- Commentaire documentation
COMMENT ON FUNCTION search_knowledge_base_flexible IS
'Recherche sémantique KB avec support Ollama (1024-dim) ou OpenAI (1536-dim). Parameter use_openai=true pour OpenAI.';

-- =============================================================================
-- 4. WRAPPER POUR COMPATIBILITÉ BACKWARD (fonction search_knowledge_base)
-- =============================================================================

-- Wrapper pour garder compatibilité avec code existant
-- Utilise automatiquement Ollama (comportement actuel)
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector,
  category_filter text DEFAULT NULL,
  subcategory_filter text DEFAULT NULL,
  limit_count int DEFAULT 5,
  threshold float DEFAULT 0.5
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
  -- Wrapper vers search_knowledge_base_flexible avec use_openai=false (Ollama)
  RETURN QUERY
  SELECT * FROM search_knowledge_base_flexible(
    query_embedding,
    category_filter,
    subcategory_filter,
    limit_count,
    threshold,
    false  -- use_openai = false (Ollama par défaut)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 5. STATISTIQUES MIGRATION
-- =============================================================================

-- Vue pour suivre la progression de la migration OpenAI
CREATE OR REPLACE VIEW vw_kb_embedding_migration_stats AS
SELECT
  COUNT(*) AS total_chunks,
  COUNT(kbc.embedding) AS chunks_ollama,
  COUNT(kbc.embedding_openai) AS chunks_openai,
  COUNT(CASE WHEN kbc.embedding IS NOT NULL AND kbc.embedding_openai IS NOT NULL THEN 1 END) AS chunks_both,
  COUNT(CASE WHEN kbc.embedding IS NULL AND kbc.embedding_openai IS NULL THEN 1 END) AS chunks_none,
  ROUND(100.0 * COUNT(kbc.embedding_openai) / NULLIF(COUNT(*), 0), 1) AS pct_openai_complete
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true;

COMMENT ON VIEW vw_kb_embedding_migration_stats IS
'Statistiques de progression de la migration vers embeddings OpenAI';

-- =============================================================================
-- ROLLBACK (si besoin)
-- =============================================================================

-- Pour rollback cette migration :
--
-- DROP VIEW IF EXISTS vw_kb_embedding_migration_stats;
-- DROP FUNCTION IF EXISTS search_knowledge_base_flexible(vector, text, text, int, float, boolean);
-- DROP INDEX IF EXISTS idx_kb_chunks_embedding_openai_ivfflat;
-- ALTER TABLE knowledge_base_chunks DROP COLUMN IF EXISTS embedding_openai;
