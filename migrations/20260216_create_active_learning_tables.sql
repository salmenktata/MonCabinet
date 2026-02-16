/**
 * Migration: Système Active Learning - Détection Gaps KB
 *
 * Tables pour tracker les questions utilisateurs sans réponse satisfaisante
 * et identifier les domaines juridiques manquants dans la Base de Connaissances
 *
 * Date: 16 février 2026
 */

-- ============================================================================
-- Table 1: active_learning_queries
-- Track toutes les queries utilisateurs avec leurs scores RAG
-- ============================================================================

CREATE TABLE IF NOT EXISTS active_learning_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Query info
  query_text TEXT NOT NULL,
  query_language VARCHAR(5) NOT NULL DEFAULT 'fr', -- 'fr' ou 'ar'

  -- RAG metrics
  rag_score NUMERIC(4, 3), -- Score max similarité (0.000-1.000)
  rag_sources_count INTEGER DEFAULT 0, -- Nombre sources retournées
  rag_threshold_met BOOLEAN DEFAULT false, -- Si >= seuil (0.70)

  -- Contexte
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  doc_type VARCHAR(50), -- Filtre doc_type appliqué (optionnel)

  -- Clustering (rempli par cron)
  cluster_id UUID, -- Groupe de queries similaires
  embedding vector(1024), -- Pour clustering (qwen3-embedding)

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index pour queries fréquentes
  query_hash VARCHAR(64) GENERATED ALWAYS AS (
    md5(lower(trim(query_text)))
  ) STORED
);

-- Index optimisés
CREATE INDEX idx_al_queries_rag_score ON active_learning_queries(rag_score) WHERE rag_score < 0.70;
CREATE INDEX idx_al_queries_threshold ON active_learning_queries(rag_threshold_met) WHERE rag_threshold_met = false;
CREATE INDEX idx_al_queries_created_at ON active_learning_queries(created_at DESC);
CREATE INDEX idx_al_queries_hash ON active_learning_queries(query_hash);
CREATE INDEX idx_al_queries_cluster ON active_learning_queries(cluster_id) WHERE cluster_id IS NOT NULL;

-- Index vectoriel pour clustering
CREATE INDEX idx_al_queries_embedding ON active_learning_queries USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================================
-- Table 2: active_learning_gaps
-- Agrégation des queries par topic/cluster (remplie par cron quotidien)
-- ============================================================================

CREATE TABLE IF NOT EXISTS active_learning_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Gap identification
  topic_name TEXT NOT NULL, -- Nom du topic (ex: "شيك بدون رصيد")
  topic_keywords TEXT[], -- Mots-clés identifiés

  -- Métriques
  query_count INTEGER NOT NULL DEFAULT 1, -- Nombre queries similaires
  avg_rag_score NUMERIC(4, 3), -- Score RAG moyen
  first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
  last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Clustering
  cluster_id UUID UNIQUE NOT NULL, -- Référence au cluster
  cluster_centroid vector(1024), -- Centroïde du cluster

  -- Suggestions
  suggested_sources TEXT[], -- URLs suggérées à crawler
  suggested_categories TEXT[], -- Catégories juridiques manquantes

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'resolved', 'ignored'
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolution_notes TEXT,

  -- Priorité (calculée automatiquement)
  priority INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN query_count >= 50 THEN 1 -- HAUTE (50+ queries)
      WHEN query_count >= 20 THEN 2 -- MOYENNE (20-49)
      WHEN query_count >= 10 THEN 3 -- BASSE (10-19)
      ELSE 4 -- TRÈS BASSE (<10)
    END
  ) STORED,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index optimisés
CREATE INDEX idx_al_gaps_status ON active_learning_gaps(status) WHERE status = 'active';
CREATE INDEX idx_al_gaps_priority ON active_learning_gaps(priority, query_count DESC);
CREATE INDEX idx_al_gaps_last_seen ON active_learning_gaps(last_seen_at DESC);
CREATE INDEX idx_al_gaps_cluster ON active_learning_gaps(cluster_id);

-- Index vectoriel pour recherche similaire
CREATE INDEX idx_al_gaps_centroid ON active_learning_gaps USING ivfflat (cluster_centroid vector_cosine_ops)
  WITH (lists = 50);

-- ============================================================================
-- Table 3: active_learning_resolutions
-- Historique des actions prises pour résoudre les gaps
-- ============================================================================

CREATE TABLE IF NOT EXISTS active_learning_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  gap_id UUID NOT NULL REFERENCES active_learning_gaps(id) ON DELETE CASCADE,

  -- Action prise
  action_type VARCHAR(50) NOT NULL, -- 'crawled_source', 'indexed_document', 'ignored', 'manual_fix'
  action_details JSONB, -- Détails spécifiques (URLs crawlées, docs indexés, etc.)

  -- Impact
  queries_affected INTEGER, -- Nombre queries concernées
  rag_score_improvement NUMERIC(4, 3), -- Amélioration score RAG moyen

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  notes TEXT
);

CREATE INDEX idx_al_resolutions_gap ON active_learning_resolutions(gap_id, created_at DESC);
CREATE INDEX idx_al_resolutions_type ON active_learning_resolutions(action_type);

-- ============================================================================
-- Vue: Gaps actifs avec statistiques
-- ============================================================================

CREATE OR REPLACE VIEW vw_active_learning_gaps_summary AS
SELECT
  g.id,
  g.topic_name,
  g.topic_keywords,
  g.query_count,
  g.avg_rag_score,
  g.priority,
  g.suggested_categories,
  g.first_seen_at,
  g.last_seen_at,
  g.status,

  -- Statistiques queries associées
  (
    SELECT COUNT(*)
    FROM active_learning_queries q
    WHERE q.cluster_id = g.cluster_id
      AND q.created_at >= NOW() - INTERVAL '7 days'
  ) as queries_last_7d,

  (
    SELECT COUNT(*)
    FROM active_learning_queries q
    WHERE q.cluster_id = g.cluster_id
      AND q.created_at >= NOW() - INTERVAL '24 hours'
  ) as queries_last_24h,

  -- Nombre résolutions
  (
    SELECT COUNT(*)
    FROM active_learning_resolutions r
    WHERE r.gap_id = g.id
  ) as resolution_count,

  -- Dernière résolution
  (
    SELECT MAX(created_at)
    FROM active_learning_resolutions r
    WHERE r.gap_id = g.id
  ) as last_resolution_at

FROM active_learning_gaps g
WHERE g.status = 'active'
ORDER BY g.priority ASC, g.query_count DESC;

-- ============================================================================
-- Fonction: Enregistrer une query avec score RAG
-- ============================================================================

CREATE OR REPLACE FUNCTION record_active_learning_query(
  p_query_text TEXT,
  p_query_language VARCHAR(5),
  p_rag_score NUMERIC,
  p_rag_sources_count INTEGER,
  p_user_id UUID DEFAULT NULL,
  p_dossier_id UUID DEFAULT NULL,
  p_doc_type VARCHAR(50) DEFAULT NULL,
  p_embedding vector(1024) DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_query_id UUID;
  v_threshold_met BOOLEAN;
BEGIN
  -- Déterminer si seuil atteint (0.70 standard, 0.30 pour arabe)
  v_threshold_met := CASE
    WHEN p_query_language = 'ar' AND p_rag_score >= 0.30 THEN true
    WHEN p_query_language = 'fr' AND p_rag_score >= 0.70 THEN true
    ELSE false
  END;

  -- Insérer query
  INSERT INTO active_learning_queries (
    query_text,
    query_language,
    rag_score,
    rag_sources_count,
    rag_threshold_met,
    user_id,
    dossier_id,
    doc_type,
    embedding
  )
  VALUES (
    p_query_text,
    p_query_language,
    p_rag_score,
    p_rag_sources_count,
    v_threshold_met,
    p_user_id,
    p_dossier_id,
    p_doc_type,
    p_embedding
  )
  RETURNING id INTO v_query_id;

  RETURN v_query_id;
END;
$$;

-- ============================================================================
-- Commentaires
-- ============================================================================

COMMENT ON TABLE active_learning_queries IS 'Track toutes les queries utilisateurs avec leurs scores RAG pour identifier gaps KB';
COMMENT ON TABLE active_learning_gaps IS 'Agrégation des queries par topic/cluster - Gaps identifiés dans la KB';
COMMENT ON TABLE active_learning_resolutions IS 'Historique des actions prises pour résoudre les gaps';

COMMENT ON COLUMN active_learning_queries.rag_threshold_met IS 'true si score >= seuil (0.70 FR, 0.30 AR)';
COMMENT ON COLUMN active_learning_gaps.priority IS 'Calculée auto: 1=HAUTE (50+), 2=MOYENNE (20-49), 3=BASSE (10-19), 4=TRÈS BASSE (<10)';
COMMENT ON COLUMN active_learning_gaps.status IS 'active (en cours), resolved (résolu), ignored (ignoré)';

-- ============================================================================
-- Permissions
-- ============================================================================

-- Super-admins seulement
GRANT SELECT, INSERT, UPDATE ON active_learning_queries TO qadhya;
GRANT SELECT, INSERT, UPDATE ON active_learning_gaps TO qadhya;
GRANT SELECT, INSERT ON active_learning_resolutions TO qadhya;
GRANT SELECT ON vw_active_learning_gaps_summary TO qadhya;
