/**
 * Migration: Logs d'utilisation IA pour monitoring des coûts
 * Date: 2026-02-06
 * Description: Table pour tracker l'utilisation des APIs IA (OpenAI, Anthropic)
 */

-- ============================================================================
-- TABLE AI_USAGE_LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Type d'opération
  operation_type TEXT NOT NULL CHECK (operation_type IN (
    'embedding',      -- Génération d'embedding OpenAI
    'chat',           -- Chat avec Claude
    'generation',     -- Génération de document
    'classification', -- Classification automatique
    'extraction'      -- Extraction métadonnées jurisprudence
  )),

  -- Fournisseur et modèle
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model TEXT NOT NULL,

  -- Tokens utilisés
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,

  -- Coût estimé en USD
  estimated_cost_usd DECIMAL(10, 6) DEFAULT 0,

  -- Contexte optionnel
  context JSONB DEFAULT '{}'::jsonb, -- Ex: {dossierId, documentId, conversationId}

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes de reporting
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created ON ai_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_operation ON ai_usage_logs(operation_type);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_provider ON ai_usage_logs(provider);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_month ON ai_usage_logs(user_id, DATE_TRUNC('month', created_at));

-- ============================================================================
-- VUES POUR REPORTING
-- ============================================================================

-- Vue: Coûts par utilisateur et par mois
CREATE OR REPLACE VIEW ai_costs_by_user_month AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_operations,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(estimated_cost_usd) as total_cost_usd,
  jsonb_object_agg(operation_type, operation_count) as operations_breakdown
FROM (
  SELECT
    user_id,
    created_at,
    input_tokens,
    output_tokens,
    estimated_cost_usd,
    operation_type,
    COUNT(*) OVER (PARTITION BY user_id, DATE_TRUNC('month', created_at), operation_type) as operation_count
  FROM ai_usage_logs
) sub
GROUP BY user_id, DATE_TRUNC('month', created_at);

-- Vue: Coûts globaux par jour (admin)
CREATE OR REPLACE VIEW ai_costs_daily AS
SELECT
  DATE(created_at) as date,
  provider,
  COUNT(*) as total_operations,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(estimated_cost_usd) as total_cost_usd
FROM ai_usage_logs
GROUP BY DATE(created_at), provider
ORDER BY date DESC;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

-- Fonction pour logger une opération IA
CREATE OR REPLACE FUNCTION log_ai_usage(
  p_user_id UUID,
  p_operation_type TEXT,
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER DEFAULT 0,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_cost_usd DECIMAL(10, 6);
  v_log_id UUID;
BEGIN
  -- Calculer le coût estimé
  IF p_provider = 'openai' THEN
    -- text-embedding-3-small: $0.02 / 1M tokens
    v_cost_usd := (p_input_tokens::DECIMAL / 1000000) * 0.02;
  ELSIF p_provider = 'anthropic' THEN
    -- Claude 3.5 Sonnet: $3 / 1M input, $15 / 1M output
    v_cost_usd := (p_input_tokens::DECIMAL / 1000000) * 3.0 +
                  (p_output_tokens::DECIMAL / 1000000) * 15.0;
  ELSE
    v_cost_usd := 0;
  END IF;

  INSERT INTO ai_usage_logs (
    user_id, operation_type, provider, model,
    input_tokens, output_tokens, estimated_cost_usd, context
  ) VALUES (
    p_user_id, p_operation_type, p_provider, p_model,
    p_input_tokens, p_output_tokens, v_cost_usd, p_context
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour obtenir les coûts d'un utilisateur sur le mois courant
CREATE OR REPLACE FUNCTION get_user_monthly_costs(p_user_id UUID)
RETURNS TABLE (
  total_operations BIGINT,
  total_cost_usd DECIMAL,
  embeddings_count BIGINT,
  chat_count BIGINT,
  generation_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_operations,
    COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
    COUNT(*) FILTER (WHERE operation_type = 'embedding') as embeddings_count,
    COUNT(*) FILTER (WHERE operation_type = 'chat') as chat_count,
    COUNT(*) FILTER (WHERE operation_type = 'generation') as generation_count
  FROM ai_usage_logs
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Table ai_usage_logs créée avec succès!';
  RAISE NOTICE '📊 Vues de reporting: ai_costs_by_user_month, ai_costs_daily';
  RAISE NOTICE '💰 Fonction log_ai_usage() disponible pour tracking';
END $$;
