-- Migration: Support Ollama embeddings (1024 dimensions)
-- Changement de 1536 (OpenAI) vers 1024 (Ollama Qwen3)
-- Note: Les embeddings existants devront être régénérés
--
-- NOTE: Cette migration a probablement échoué silencieusement car elle référence
-- knowledge_base_documents (table inexistante) au lieu de knowledge_base_chunks.
-- La colonne embedding_openai a été correctement ajoutée via 20260217000020_add_openai_embeddings.sql.

-- =============================================================================
-- 1. Modifier les colonnes embedding dans les tables
-- =============================================================================

-- Table knowledge_base_documents
ALTER TABLE knowledge_base_documents
  ALTER COLUMN embedding TYPE vector(1024);

-- Table knowledge_base_chunks
ALTER TABLE knowledge_base_chunks
  ALTER COLUMN embedding TYPE vector(1024);

-- Table document_embeddings (si elle existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_embeddings') THEN
    ALTER TABLE document_embeddings ALTER COLUMN embedding TYPE vector(1024);
  END IF;
END $$;

-- Table jurisprudence (si elle existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jurisprudence') THEN
    ALTER TABLE jurisprudence ALTER COLUMN embedding TYPE vector(1024);
  END IF;
END $$;

-- =============================================================================
-- 2. Mettre à jour les fonctions de recherche
-- =============================================================================

-- Fonction search_knowledge_base
CREATE OR REPLACE FUNCTION search_knowledge_base(
  query_embedding vector(1024),
  p_category TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 10,
  p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  file_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.title,
    d.description,
    d.category,
    d.file_url,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM knowledge_base_documents d
  WHERE
    d.embedding IS NOT NULL
    AND d.status = 'indexed'
    AND (p_category IS NULL OR d.category = p_category)
    AND 1 - (d.embedding <=> query_embedding) >= p_similarity_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;

-- Fonction search_document_embeddings (si elle existe)
CREATE OR REPLACE FUNCTION search_document_embeddings(
  query_embedding vector(1024),
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INTEGER,
  content_chunk TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    de.chunk_index,
    de.content_chunk,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  WHERE
    d.user_id = p_user_id
    AND 1 - (de.embedding <=> query_embedding) >= p_similarity_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;

-- Fonction search_dossier_embeddings (si elle existe)
CREATE OR REPLACE FUNCTION search_dossier_embeddings(
  query_embedding vector(1024),
  p_dossier_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  document_id UUID,
  chunk_index INTEGER,
  content_chunk TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    de.chunk_index,
    de.content_chunk,
    1 - (de.embedding <=> query_embedding) AS similarity
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  WHERE
    d.dossier_id = p_dossier_id
    AND d.user_id = p_user_id
    AND 1 - (de.embedding <=> query_embedding) >= p_similarity_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 3. Réinitialiser le statut des documents pour re-indexation
-- =============================================================================

-- Marquer tous les documents knowledge_base comme non-indexés pour régénérer les embeddings
UPDATE knowledge_base_documents
SET status = 'pending', embedding = NULL, is_indexed = false
WHERE embedding IS NOT NULL;

-- Supprimer les anciens chunks (seront régénérés)
DELETE FROM knowledge_base_chunks;

-- =============================================================================
-- 4. Commentaire de documentation
-- =============================================================================

COMMENT ON COLUMN knowledge_base_documents.embedding IS 'Vecteur embedding 1024 dimensions (Ollama Qwen3)';
COMMENT ON COLUMN knowledge_base_chunks.embedding IS 'Vecteur embedding 1024 dimensions (Ollama Qwen3)';
