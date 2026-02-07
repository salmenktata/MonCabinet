-- Migration: Fonction pour trouver les documents similaires dans la base de connaissances
-- Cette fonction utilise les embeddings existants et l'index HNSW pour une recherche rapide

-- =============================================================================
-- FONCTION: find_related_documents
-- =============================================================================
-- Trouve les documents similaires à un document donné en utilisant la similarité cosine
-- des embeddings. Utilise l'index HNSW pour des performances optimales (~10-50ms).

CREATE OR REPLACE FUNCTION find_related_documents(
  p_document_id UUID,
  p_limit INTEGER DEFAULT 5,
  p_threshold FLOAT DEFAULT 0.6
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  category TEXT,
  subcategory VARCHAR(50),
  language VARCHAR(5),
  similarity FLOAT,
  chunk_count INTEGER,
  tags TEXT[],
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_embedding vector(1024);
  v_category TEXT;
BEGIN
  -- Récupérer l'embedding du document source
  SELECT kb.embedding, kb.category INTO v_embedding, v_category
  FROM knowledge_base kb
  WHERE kb.id = p_document_id
    AND kb.is_active = true
    AND kb.is_indexed = true;

  -- Si le document n'a pas d'embedding, retourner vide
  IF v_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Rechercher les documents similaires via KNN sur l'index HNSW
  RETURN QUERY
  SELECT
    kb.id,
    kb.title,
    kb.description,
    kb.category,
    kb.subcategory,
    kb.language,
    (1 - (kb.embedding <=> v_embedding))::FLOAT as similarity,
    COALESCE(
      (SELECT COUNT(*)::INTEGER FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id = kb.id),
      0
    ) as chunk_count,
    kb.tags,
    kb.created_at
  FROM knowledge_base kb
  WHERE kb.id != p_document_id
    AND kb.is_active = true
    AND kb.is_indexed = true
    AND kb.embedding IS NOT NULL
    AND (1 - (kb.embedding <=> v_embedding)) >= p_threshold
  ORDER BY kb.embedding <=> v_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Commentaire sur la fonction
COMMENT ON FUNCTION find_related_documents(UUID, INTEGER, FLOAT) IS
'Trouve les documents de la base de connaissances similaires à un document donné.
Paramètres:
  - p_document_id: UUID du document source
  - p_limit: Nombre max de résultats (défaut: 5)
  - p_threshold: Seuil de similarité minimum (défaut: 0.6)
Retourne: Liste de documents avec leur score de similarité, triés par pertinence.
Performance: ~10-50ms grâce à l''index HNSW sur les embeddings.';
