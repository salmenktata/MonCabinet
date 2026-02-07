-- Migration: Clustering sémantique pour la base de connaissances
-- Date: 2026-02-08
-- Description: Ajoute la colonne cluster_id pour grouper les documents KB par similarité

-- =============================================================================
-- ALTER TABLE: knowledge_base
-- =============================================================================

-- Ajouter la colonne cluster_id si elle n'existe pas
ALTER TABLE knowledge_base
ADD COLUMN IF NOT EXISTS cluster_id INTEGER;

-- Index pour les requêtes par cluster
CREATE INDEX IF NOT EXISTS idx_kb_cluster
ON knowledge_base(cluster_id)
WHERE cluster_id IS NOT NULL;

-- Index composite pour les documents actifs par cluster
CREATE INDEX IF NOT EXISTS idx_kb_cluster_active
ON knowledge_base(cluster_id, status)
WHERE status = 'active' AND cluster_id IS NOT NULL;

-- =============================================================================
-- FONCTIONS
-- =============================================================================

/**
 * Récupère les documents liés à un document donné
 * Utilise d'abord le cluster, puis la similarité sémantique
 */
CREATE OR REPLACE FUNCTION get_related_kb_documents(
  p_document_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  category TEXT,
  similarity FLOAT,
  same_cluster BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT kb.cluster_id, e.embedding
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_embeddings e ON kb.id = e.knowledge_base_id
    WHERE kb.id = p_document_id
    LIMIT 1
  ),
  same_cluster_docs AS (
    SELECT
      kb.id,
      kb.title,
      kb.category,
      0.95::FLOAT as similarity,
      true as same_cluster
    FROM knowledge_base kb, target t
    WHERE kb.cluster_id = t.cluster_id
      AND kb.cluster_id IS NOT NULL
      AND kb.cluster_id >= 0
      AND kb.id != p_document_id
      AND kb.status = 'active'
    ORDER BY kb.updated_at DESC
    LIMIT p_limit
  ),
  semantic_docs AS (
    SELECT
      kb.id,
      kb.title,
      kb.category,
      (1 - (e.embedding <=> t.embedding))::FLOAT as similarity,
      false as same_cluster
    FROM knowledge_base kb
    JOIN knowledge_base_embeddings e ON kb.id = e.knowledge_base_id
    CROSS JOIN target t
    WHERE kb.id != p_document_id
      AND kb.status = 'active'
      AND t.embedding IS NOT NULL
      AND (1 - (e.embedding <=> t.embedding)) > 0.5
    ORDER BY e.embedding <=> t.embedding
    LIMIT p_limit
  )
  SELECT * FROM same_cluster_docs
  UNION ALL
  SELECT s.* FROM semantic_docs s
  WHERE s.id NOT IN (SELECT sc.id FROM same_cluster_docs sc)
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Statistiques des clusters KB
 */
CREATE OR REPLACE FUNCTION get_kb_cluster_stats()
RETURNS TABLE (
  total_documents BIGINT,
  clustered_documents BIGINT,
  noise_documents BIGINT,
  cluster_count BIGINT,
  avg_cluster_size NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_documents,
    COUNT(*) FILTER (WHERE cluster_id IS NOT NULL AND cluster_id >= 0)::BIGINT as clustered_documents,
    COUNT(*) FILTER (WHERE cluster_id = -1)::BIGINT as noise_documents,
    COUNT(DISTINCT cluster_id) FILTER (WHERE cluster_id >= 0)::BIGINT as cluster_count,
    CASE
      WHEN COUNT(DISTINCT cluster_id) FILTER (WHERE cluster_id >= 0) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE cluster_id >= 0)::NUMERIC /
        COUNT(DISTINCT cluster_id) FILTER (WHERE cluster_id >= 0)::NUMERIC,
        2
      )
      ELSE 0
    END as avg_cluster_size
  FROM knowledge_base
  WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTAIRES
-- =============================================================================

COMMENT ON COLUMN knowledge_base.cluster_id IS
'ID du cluster sémantique (généré par HDBSCAN). -1 = bruit, NULL = non clusté, >= 0 = cluster valide';

COMMENT ON FUNCTION get_related_kb_documents IS
'Récupère les documents KB liés par cluster ou similarité sémantique';

COMMENT ON FUNCTION get_kb_cluster_stats IS
'Statistiques globales du clustering KB';

-- =============================================================================
-- VÉRIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration clustering KB terminée!';
  RAISE NOTICE '📊 Colonne cluster_id ajoutée à knowledge_base';
  RAISE NOTICE '🔍 Fonctions: get_related_kb_documents, get_kb_cluster_stats';
END $$;
