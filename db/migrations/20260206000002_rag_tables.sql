/**
 * Migration: Tables RAG (embeddings et feature flags)
 * Date: 2026-02-06
 * Description: Créer les tables pour le système RAG - embeddings documents et feature flags
 */

-- ============================================================================
-- TABLE DOCUMENT_EMBEDDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content_chunk TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index HNSW pour recherche vectorielle rapide (cosine similarity)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector
  ON document_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Index pour filtrage par utilisateur et document
CREATE INDEX IF NOT EXISTS idx_document_embeddings_user ON document_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_user ON document_embeddings(document_id, user_id);

-- ============================================================================
-- TABLE FEATURE_FLAGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  enable_semantic_search BOOLEAN DEFAULT false,
  enable_ai_chat BOOLEAN DEFAULT false,
  enable_ai_generation BOOLEAN DEFAULT false,
  enable_auto_classification BOOLEAN DEFAULT false,
  monthly_ai_queries_limit INTEGER DEFAULT 100,
  monthly_ai_queries_used INTEGER DEFAULT 0,
  quota_reset_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour recherche par user
CREATE INDEX IF NOT EXISTS idx_feature_flags_user ON feature_flags(user_id);

-- Trigger pour updated_at
CREATE TRIGGER update_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FONCTIONS UTILITAIRES RAG
-- ============================================================================

-- Fonction de recherche sémantique
CREATE OR REPLACE FUNCTION search_document_embeddings(
  query_embedding vector(1536),
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  document_id UUID,
  document_name VARCHAR(255),
  content_chunk TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.nom as document_name,
    de.content_chunk,
    de.chunk_index,
    (1 - (de.embedding <=> query_embedding))::FLOAT as similarity,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE de.user_id = p_user_id
    AND (1 - (de.embedding <=> query_embedding)) >= p_threshold
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Fonction de recherche sémantique par dossier
CREATE OR REPLACE FUNCTION search_dossier_embeddings(
  query_embedding vector(1536),
  p_dossier_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  document_id UUID,
  document_name VARCHAR(255),
  content_chunk TEXT,
  chunk_index INTEGER,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    de.document_id,
    d.nom as document_name,
    de.content_chunk,
    de.chunk_index,
    (1 - (de.embedding <=> query_embedding))::FLOAT as similarity,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE de.user_id = p_user_id
    AND d.dossier_id = p_dossier_id
  ORDER BY de.embedding <=> query_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour incrémenter le compteur de requêtes IA
CREATE OR REPLACE FUNCTION increment_ai_query_count(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
  v_reset_date DATE;
BEGIN
  -- Récupérer ou créer les feature flags
  INSERT INTO feature_flags (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Récupérer les valeurs actuelles
  SELECT monthly_ai_queries_limit, monthly_ai_queries_used, quota_reset_date
  INTO v_limit, v_used, v_reset_date
  FROM feature_flags
  WHERE user_id = p_user_id;

  -- Réinitialiser si nouveau mois
  IF v_reset_date < DATE_TRUNC('month', CURRENT_DATE) THEN
    UPDATE feature_flags
    SET monthly_ai_queries_used = 1,
        quota_reset_date = DATE_TRUNC('month', CURRENT_DATE)
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- Vérifier le quota
  IF v_used >= v_limit THEN
    RETURN FALSE;
  END IF;

  -- Incrémenter
  UPDATE feature_flags
  SET monthly_ai_queries_used = monthly_ai_queries_used + 1
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Tables RAG créées avec succès!';
  RAISE NOTICE '📊 Tables: document_embeddings, feature_flags';
  RAISE NOTICE '🔍 Index HNSW pour recherche vectorielle configuré';
END $$;
