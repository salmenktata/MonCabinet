-- ============================================================================
-- Migration: Système Feedback RAG (Phase 5.1)
-- Date: 2026-02-28
-- Description: Table feedback avocats pour amélioration continue RAG
-- ============================================================================

-- ============================================================================
-- TABLE : FEEDBACKS RAG
-- ============================================================================

CREATE TABLE IF NOT EXISTS rag_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conversation
  conversation_id UUID, -- Peut être NULL si feedback hors conversation
  message_id TEXT, -- ID message spécifique si applicable

  -- Question/Réponse
  question TEXT NOT NULL,
  answer TEXT,
  sources_used UUID[], -- IDs documents KB utilisés

  -- Évaluation
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  feedback_type TEXT[] DEFAULT ARRAY[]::TEXT[], -- ['missing_info', 'incorrect_citation', 'incomplete', 'hallucination', 'other']

  -- Détails feedback
  missing_info TEXT, -- Description infos manquantes
  incorrect_citation TEXT, -- Citation incorrecte signalée
  incomplete_reason TEXT, -- Pourquoi réponse incomplète
  hallucination_details TEXT, -- Détails hallucination si signalée
  suggested_sources TEXT[], -- Sources suggérées par avocat
  comment TEXT, -- Commentaire libre

  -- Utilisateur
  user_id UUID REFERENCES users(id),
  user_role VARCHAR(50), -- 'lawyer', 'admin', etc.
  user_experience VARCHAR(50), -- 'junior', 'senior', 'expert'

  -- Contexte juridique
  domain VARCHAR(100), -- Domaine juridique (civil, pénal, etc.)
  complexity VARCHAR(20) CHECK (complexity IN ('simple', 'medium', 'complex', 'expert')),

  -- Métriques RAG
  rag_confidence FLOAT, -- Confidence score RAG (0-1)
  sources_count INTEGER, -- Nombre sources trouvées
  response_time_ms INTEGER, -- Temps réponse en ms

  -- Suivi
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT feedback_type_valid CHECK (
    feedback_type <@ ARRAY['missing_info', 'incorrect_citation', 'incomplete', 'hallucination', 'outdated', 'unclear', 'other']::TEXT[]
  )
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_rag_feedback_user ON rag_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_rating ON rag_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_domain ON rag_feedback(domain) WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rag_feedback_created ON rag_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_feedback_unresolved ON rag_feedback(is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS idx_rag_feedback_type ON rag_feedback USING GIN(feedback_type);

-- Index pour recherche texte
CREATE INDEX IF NOT EXISTS idx_rag_feedback_question_search ON rag_feedback USING GIN(to_tsvector('french', question));
CREATE INDEX IF NOT EXISTS idx_rag_feedback_comment_search ON rag_feedback USING GIN(to_tsvector('french', comment)) WHERE comment IS NOT NULL;

-- ============================================================================
-- TABLE : ASSIGNMENTS A/B TESTING (Phase 5.3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  variant VARCHAR(20) NOT NULL CHECK (variant IN ('control', 'variant_a', 'variant_b')),
  test_name VARCHAR(100) NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, test_name)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_user ON ab_test_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant ON ab_test_assignments(variant);

-- ============================================================================
-- VUES UTILES
-- ============================================================================

-- Vue : Stats feedback par domaine
CREATE OR REPLACE VIEW vw_feedback_stats_by_domain AS
SELECT
  domain,
  COUNT(*) AS total_feedbacks,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(*) FILTER (WHERE rating >= 4) AS positive_count,
  COUNT(*) FILTER (WHERE rating <= 2) AS negative_count,
  COUNT(*) FILTER (WHERE 'hallucination' = ANY(feedback_type)) AS hallucination_count,
  COUNT(*) FILTER (WHERE 'missing_info' = ANY(feedback_type)) AS missing_info_count,
  COUNT(*) FILTER (WHERE 'incorrect_citation' = ANY(feedback_type)) AS incorrect_citation_count,
  ROUND(AVG(rag_confidence), 3) AS avg_rag_confidence,
  ROUND(AVG(response_time_ms), 0) AS avg_response_time_ms
FROM rag_feedback
WHERE domain IS NOT NULL
GROUP BY domain
ORDER BY total_feedbacks DESC;

-- Vue : Feedbacks non résolus prioritaires
CREATE OR REPLACE VIEW vw_feedback_unresolved_priority AS
SELECT
  id,
  question,
  rating,
  feedback_type,
  domain,
  rag_confidence,
  sources_count,
  created_at,
  -- Score priorité (bas rating + hallucination + faible confiance RAG)
  (
    (5 - rating) * 2 +
    CASE WHEN 'hallucination' = ANY(feedback_type) THEN 5 ELSE 0 END +
    CASE WHEN rag_confidence < 0.5 THEN 3 ELSE 0 END +
    CASE WHEN sources_count < 3 THEN 2 ELSE 0 END
  ) AS priority_score
FROM rag_feedback
WHERE is_resolved = false
ORDER BY priority_score DESC, created_at DESC
LIMIT 100;

-- Vue : Stats satisfaction par rôle utilisateur
CREATE OR REPLACE VIEW vw_feedback_satisfaction_by_role AS
SELECT
  user_role,
  user_experience,
  COUNT(*) AS total_feedbacks,
  ROUND(AVG(rating), 2) AS avg_rating,
  ROUND(
    COUNT(*) FILTER (WHERE rating >= 4)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
    1
  ) AS satisfaction_rate_percent
FROM rag_feedback
WHERE user_role IS NOT NULL
GROUP BY user_role, user_experience
ORDER BY total_feedbacks DESC;

-- Vue : Évolution satisfaction dans le temps
CREATE OR REPLACE VIEW vw_feedback_satisfaction_trend AS
SELECT
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS total_feedbacks,
  ROUND(AVG(rating), 2) AS avg_rating,
  COUNT(*) FILTER (WHERE rating >= 4) AS positive_count,
  COUNT(*) FILTER (WHERE rating <= 2) AS negative_count,
  ROUND(AVG(rag_confidence), 3) AS avg_confidence
FROM rag_feedback
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- ============================================================================
-- FONCTIONS
-- ============================================================================

-- Fonction : Obtenir gaps KB depuis feedbacks négatifs
CREATE OR REPLACE FUNCTION get_knowledge_gaps(
  p_min_occurrences INTEGER DEFAULT 3,
  p_max_rating INTEGER DEFAULT 2,
  p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
  topic TEXT,
  occurrence_count BIGINT,
  avg_rating NUMERIC,
  suggested_sources TEXT[],
  example_questions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    domain AS topic,
    COUNT(*) AS occurrence_count,
    ROUND(AVG(rating), 2) AS avg_rating,
    ARRAY_AGG(DISTINCT unnest) FILTER (WHERE unnest IS NOT NULL) AS suggested_sources,
    ARRAY_AGG(DISTINCT question ORDER BY created_at DESC) FILTER (WHERE question IS NOT NULL) AS example_questions
  FROM (
    SELECT
      domain,
      rating,
      question,
      created_at,
      unnest(suggested_sources) AS unnest
    FROM rag_feedback
    WHERE rating <= p_max_rating
      AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL
      AND domain IS NOT NULL
  ) sub
  GROUP BY domain
  HAVING COUNT(*) >= p_min_occurrences
  ORDER BY occurrence_count DESC, avg_rating ASC
  LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Fonction : Stats feedback pour période
CREATE OR REPLACE FUNCTION get_feedback_stats(
  p_days_back INTEGER DEFAULT 7
)
RETURNS TABLE (
  total_feedbacks BIGINT,
  avg_rating NUMERIC,
  satisfaction_rate NUMERIC,
  hallucination_rate NUMERIC,
  avg_response_time NUMERIC,
  most_common_issue TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) AS total_feedbacks,
    ROUND(AVG(rating), 2) AS avg_rating,
    ROUND(
      COUNT(*) FILTER (WHERE rating >= 4)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
      1
    ) AS satisfaction_rate,
    ROUND(
      COUNT(*) FILTER (WHERE 'hallucination' = ANY(feedback_type))::NUMERIC / NULLIF(COUNT(*), 0) * 100,
      1
    ) AS hallucination_rate,
    ROUND(AVG(response_time_ms), 0) AS avg_response_time,
    (
      SELECT unnest(feedback_type)
      FROM rag_feedback
      WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL
      GROUP BY unnest(feedback_type)
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_issue
  FROM rag_feedback
  WHERE created_at >= NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGER : MAJ updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_rag_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_rag_feedback_updated_at
  BEFORE UPDATE ON rag_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_rag_feedback_updated_at();

-- ============================================================================
-- COMMENTAIRES
-- ============================================================================

COMMENT ON TABLE rag_feedback IS 'Feedbacks avocats sur réponses RAG pour amélioration continue (Phase 5.1)';
COMMENT ON COLUMN rag_feedback.rating IS 'Évaluation 1-5 étoiles (1=très mauvais, 5=excellent)';
COMMENT ON COLUMN rag_feedback.feedback_type IS 'Types problèmes : missing_info, incorrect_citation, hallucination, etc.';
COMMENT ON COLUMN rag_feedback.suggested_sources IS 'Sources suggérées par avocat (URLs, références juridiques)';
COMMENT ON COLUMN rag_feedback.rag_confidence IS 'Score confiance RAG (0-1) au moment de la réponse';

COMMENT ON FUNCTION get_knowledge_gaps IS 'Identifie gaps KB depuis feedbacks négatifs récurrents (Active Learning)';
COMMENT ON FUNCTION get_feedback_stats IS 'Stats globales feedback pour période donnée';

COMMENT ON VIEW vw_feedback_unresolved_priority IS 'Feedbacks non résolus triés par priorité (rating bas + hallucination + faible confiance)';

-- ============================================================================
-- FIN MIGRATION
-- ============================================================================
