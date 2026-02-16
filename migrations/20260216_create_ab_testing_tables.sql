/**
 * Migration: Système A/B Testing Prompts
 *
 * Tables pour tester et comparer l'efficacité de différents prompts système
 *
 * Date: 16 février 2026
 */

-- ============================================================================
-- Table 1: ab_tests
-- Définition des tests A/B
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Test info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Configuration
  target_component VARCHAR(100) NOT NULL, -- 'chat', 'consultation', 'indexation', etc.
  allocation_strategy VARCHAR(50) NOT NULL DEFAULT 'random', -- 'random', 'weighted', 'user_based'

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
  winner_variant_id UUID, -- Variante gagnante déclarée

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ab_tests_status ON ab_tests(status) WHERE status IN ('active', 'paused');
CREATE INDEX idx_ab_tests_component ON ab_tests(target_component, status);

-- ============================================================================
-- Table 2: ab_test_variants
-- Variantes de prompts/configs pour chaque test
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,

  -- Variant info
  name VARCHAR(100) NOT NULL, -- 'A', 'B', 'C', 'Control', etc.
  description TEXT,

  -- Configuration
  prompt_template TEXT, -- Template de prompt (si applicable)
  config_json JSONB, -- Config LLM (model, temperature, max_tokens, etc.)

  -- Allocation
  traffic_percentage INTEGER DEFAULT 0 CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(test_id, name)
);

CREATE INDEX idx_ab_variants_test ON ab_test_variants(test_id);

-- ============================================================================
-- Table 3: ab_test_results
-- Résultats individuels pour chaque interaction
-- ============================================================================

CREATE TABLE IF NOT EXISTS ab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,

  -- Context
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  dossier_id UUID REFERENCES dossiers(id) ON DELETE SET NULL,
  chat_message_id UUID, -- Lien vers message chat (optionnel)

  -- Metrics
  user_feedback INTEGER CHECK (user_feedback IN (-1, 0, 1)), -- -1=thumbs down, 0=neutral, 1=thumbs up
  completion_time_ms INTEGER, -- Temps réponse (ms)
  tokens_used INTEGER, -- Tokens consommés
  rag_score NUMERIC(4, 3), -- Score RAG si applicable
  response_length INTEGER, -- Longueur réponse

  -- Flags
  completed BOOLEAN DEFAULT true,
  error_occurred BOOLEAN DEFAULT false,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ab_results_test ON ab_test_results(test_id, created_at DESC);
CREATE INDEX idx_ab_results_variant ON ab_test_results(variant_id);
CREATE INDEX idx_ab_results_feedback ON ab_test_results(user_feedback) WHERE user_feedback IS NOT NULL;

-- ============================================================================
-- Vue: Statistiques par variante
-- ============================================================================

CREATE OR REPLACE VIEW vw_ab_test_stats AS
SELECT
  t.id as test_id,
  t.name as test_name,
  t.status as test_status,
  v.id as variant_id,
  v.name as variant_name,

  -- Sample size
  COUNT(r.id) as total_results,

  -- User feedback
  COUNT(r.id) FILTER (WHERE r.user_feedback = 1) as thumbs_up,
  COUNT(r.id) FILTER (WHERE r.user_feedback = -1) as thumbs_down,
  ROUND(
    COUNT(r.id) FILTER (WHERE r.user_feedback = 1)::numeric /
    NULLIF(COUNT(r.id) FILTER (WHERE r.user_feedback IS NOT NULL), 0) * 100,
    1
  ) as satisfaction_rate,

  -- Performance
  ROUND(AVG(r.completion_time_ms)::numeric, 0) as avg_completion_ms,
  ROUND(AVG(r.tokens_used)::numeric, 0) as avg_tokens,
  ROUND(AVG(r.response_length)::numeric, 0) as avg_response_length,

  -- Quality
  ROUND(AVG(r.rag_score)::numeric, 3) as avg_rag_score,

  -- Errors
  COUNT(r.id) FILTER (WHERE r.error_occurred = true) as error_count,
  ROUND(
    COUNT(r.id) FILTER (WHERE r.error_occurred = true)::numeric /
    NULLIF(COUNT(r.id), 0) * 100,
    1
  ) as error_rate

FROM ab_tests t
INNER JOIN ab_test_variants v ON v.test_id = t.id
LEFT JOIN ab_test_results r ON r.variant_id = v.id
GROUP BY t.id, t.name, t.status, v.id, v.name
ORDER BY t.created_at DESC, v.name;

-- ============================================================================
-- Fonction: Assigner variante aléatoire
-- ============================================================================

CREATE OR REPLACE FUNCTION assign_ab_test_variant(
  p_test_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_variant_id UUID;
  v_total_traffic INTEGER;
BEGIN
  -- Vérifier que le test est actif
  IF NOT EXISTS (
    SELECT 1 FROM ab_tests WHERE id = p_test_id AND status = 'active'
  ) THEN
    RETURN NULL;
  END IF;

  -- Vérifier que la somme des pourcentages = 100
  SELECT SUM(traffic_percentage) INTO v_total_traffic
  FROM ab_test_variants
  WHERE test_id = p_test_id;

  IF v_total_traffic != 100 THEN
    RAISE WARNING 'Traffic percentage sum != 100 (got %)', v_total_traffic;
    RETURN NULL;
  END IF;

  -- Assigner variante selon pourcentages (weighted random)
  WITH ranked_variants AS (
    SELECT
      id,
      traffic_percentage,
      SUM(traffic_percentage) OVER (ORDER BY name) as cumulative_percentage
    FROM ab_test_variants
    WHERE test_id = p_test_id
    ORDER BY name
  )
  SELECT id INTO v_variant_id
  FROM ranked_variants
  WHERE cumulative_percentage >= (random() * 100)
  ORDER BY cumulative_percentage ASC
  LIMIT 1;

  RETURN v_variant_id;
END;
$$;

-- ============================================================================
-- Fonction: Enregistrer résultat
-- ============================================================================

CREATE OR REPLACE FUNCTION record_ab_test_result(
  p_test_id UUID,
  p_variant_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_dossier_id UUID DEFAULT NULL,
  p_completion_time_ms INTEGER DEFAULT NULL,
  p_tokens_used INTEGER DEFAULT NULL,
  p_rag_score NUMERIC DEFAULT NULL,
  p_response_length INTEGER DEFAULT NULL,
  p_error_occurred BOOLEAN DEFAULT false,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_result_id UUID;
BEGIN
  INSERT INTO ab_test_results (
    test_id,
    variant_id,
    user_id,
    dossier_id,
    completion_time_ms,
    tokens_used,
    rag_score,
    response_length,
    error_occurred,
    error_message
  )
  VALUES (
    p_test_id,
    p_variant_id,
    p_user_id,
    p_dossier_id,
    p_completion_time_ms,
    p_tokens_used,
    p_rag_score,
    p_response_length,
    p_error_occurred,
    p_error_message
  )
  RETURNING id INTO v_result_id;

  RETURN v_result_id;
END;
$$;

-- ============================================================================
-- Commentaires
-- ============================================================================

COMMENT ON TABLE ab_tests IS 'Tests A/B pour comparer efficacité prompts/configs';
COMMENT ON TABLE ab_test_variants IS 'Variantes de prompts pour chaque test (A, B, C, etc.)';
COMMENT ON TABLE ab_test_results IS 'Résultats individuels pour chaque interaction testée';

COMMENT ON COLUMN ab_tests.allocation_strategy IS 'random (équitable), weighted (basé sur traffic_percentage), user_based (même user = même variante)';
COMMENT ON COLUMN ab_test_variants.traffic_percentage IS 'Pourcentage du trafic alloué à cette variante (total doit = 100)';
COMMENT ON COLUMN ab_test_results.user_feedback IS '-1=thumbs down, 0=neutral, 1=thumbs up';

-- ============================================================================
-- Permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON ab_tests TO qadhya;
GRANT SELECT, INSERT, UPDATE ON ab_test_variants TO qadhya;
GRANT SELECT, INSERT ON ab_test_results TO qadhya;
GRANT SELECT ON vw_ab_test_stats TO qadhya;
