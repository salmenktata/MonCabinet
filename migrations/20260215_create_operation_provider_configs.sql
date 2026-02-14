-- =============================================================================
-- Migration: Gestion Dynamique des Providers par Opération
-- Date: 2026-02-15
-- Description: Permet de configurer providers, fallback et timeouts par opération
--              depuis l'UI super admin (vs config statique hardcodée)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table principale: configuration providers par opération
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operation_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Operation identification
  operation_name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50) DEFAULT 'general',

  -- Provider configuration (chat/LLM)
  primary_provider VARCHAR(50) NOT NULL,
  fallback_providers JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_providers JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Embeddings configuration (si applicable)
  embeddings_provider VARCHAR(50),
  embeddings_fallback_provider VARCHAR(50),
  embeddings_model VARCHAR(100),
  embeddings_dimensions INTEGER,

  -- Timeouts (milliseconds)
  timeout_embedding INTEGER DEFAULT 5000,
  timeout_chat INTEGER DEFAULT 30000,
  timeout_total INTEGER DEFAULT 45000,

  -- LLM configuration
  llm_temperature DECIMAL(3,2) DEFAULT 0.30,
  llm_max_tokens INTEGER DEFAULT 2000,

  -- State management
  is_active BOOLEAN DEFAULT true,
  use_static_config BOOLEAN DEFAULT false,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255),

  -- Constraints
  CHECK (operation_name IN (
    'indexation',
    'assistant-ia',
    'dossiers-assistant',
    'dossiers-consultation',
    'kb-quality-analysis',
    'kb-quality-analysis-short'
  )),
  CHECK (primary_provider IN ('gemini', 'groq', 'deepseek', 'anthropic', 'openai', 'ollama')),
  CHECK (embeddings_provider IS NULL OR embeddings_provider IN ('openai', 'ollama')),
  CHECK (embeddings_fallback_provider IS NULL OR embeddings_fallback_provider IN ('openai', 'ollama')),
  CHECK (llm_temperature >= 0 AND llm_temperature <= 2),
  CHECK (llm_max_tokens > 0 AND llm_max_tokens <= 16000),
  CHECK (timeout_embedding > 0 AND timeout_embedding <= 300000),
  CHECK (timeout_chat > 0 AND timeout_chat <= 600000),
  CHECK (timeout_total > 0 AND timeout_total <= 600000),
  CHECK (timeout_chat <= timeout_total),
  CHECK (category IN ('chat', 'indexation', 'dossiers', 'quality', 'general'))
);

-- Indexes
CREATE INDEX idx_operation_configs_operation ON operation_provider_configs(operation_name);
CREATE INDEX idx_operation_configs_active ON operation_provider_configs(is_active);
CREATE INDEX idx_operation_configs_primary ON operation_provider_configs(primary_provider);
CREATE INDEX idx_operation_configs_category ON operation_provider_configs(category);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_operation_configs_updated_at
  BEFORE UPDATE ON operation_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- Table audit trail: historique des changements de configuration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_config_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Reference
  config_id UUID REFERENCES operation_provider_configs(id) ON DELETE SET NULL,
  operation_name VARCHAR(100) NOT NULL,

  -- Change details
  change_type VARCHAR(50) NOT NULL,
  changed_fields TEXT[] NOT NULL,
  old_values JSONB,
  new_values JSONB,

  -- Metadata
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by VARCHAR(255) NOT NULL,
  change_reason TEXT,

  CHECK (change_type IN ('create', 'update', 'delete', 'reset', 'enable', 'disable'))
);

CREATE INDEX idx_config_history_operation ON ai_config_change_history(operation_name, changed_at DESC);
CREATE INDEX idx_config_history_user ON ai_config_change_history(changed_by, changed_at DESC);
CREATE INDEX idx_config_history_type ON ai_config_change_history(change_type);

-- -----------------------------------------------------------------------------
-- Seed initial data from static config (lib/ai/operations-config.ts)
-- Préserve l'état actuel: 4/6 providers actifs (Groq, Gemini, OpenAI, DeepSeek)
-- -----------------------------------------------------------------------------

-- 1. ASSISTANT IA (chat temps réel utilisateur)
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'assistant-ia',
  'Assistant IA',
  'Chat utilisateur temps réel (performance critique, volume élevé)',
  'chat',
  'groq',
  '["gemini", "deepseek", "ollama"]'::jsonb,
  '["groq", "gemini", "deepseek", "ollama"]'::jsonb,
  'openai',
  'ollama',
  'text-embedding-3-small',
  1536,
  3000,
  30000,
  45000,
  0.10,
  2000,
  'system-migration'
);

-- 2. INDEXATION KB
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'indexation',
  'Indexation KB',
  'Indexation documents KB en batch (background processing)',
  'indexation',
  'openai',
  '["ollama"]'::jsonb,
  '["openai", "ollama"]'::jsonb,
  'openai',
  'ollama',
  'text-embedding-3-small',
  1536,
  10000,
  30000,
  60000,
  0.20,
  2000,
  'system-migration'
);

-- 3. ASSISTANT DOSSIERS
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'dossiers-assistant',
  'Assistant Dossiers',
  'Analyse approfondie dossier (qualité critique)',
  'dossiers',
  'gemini',
  '["groq", "deepseek"]'::jsonb,
  '["gemini", "groq", "deepseek"]'::jsonb,
  'openai',
  'ollama',
  'text-embedding-3-small',
  1536,
  5000,
  25000,
  45000,
  0.20,
  3000,
  'system-migration'
);

-- 4. CONSULTATION JURIDIQUE
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'dossiers-consultation',
  'Consultation Juridique',
  'Consultation juridique formelle IRAC (qualité maximale)',
  'dossiers',
  'gemini',
  '["deepseek", "groq"]'::jsonb,
  '["gemini", "deepseek", "groq"]'::jsonb,
  'openai',
  'ollama',
  'text-embedding-3-small',
  1536,
  5000,
  30000,
  60000,
  0.10,
  4000,
  'system-migration'
);

-- 5. ANALYSE QUALITÉ KB (documents longs)
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'kb-quality-analysis',
  'Analyse Qualité KB',
  'Analyse qualité documents KB longs (>500 chars)',
  'quality',
  'gemini',
  '["openai", "ollama"]'::jsonb,
  '["gemini", "openai", "ollama"]'::jsonb,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  30000,
  60000,
  0.10,
  4000,
  'system-migration'
);

-- 6. ANALYSE QUALITÉ KB (documents courts)
INSERT INTO operation_provider_configs (
  operation_name, display_name, description, category,
  primary_provider, fallback_providers, enabled_providers,
  embeddings_provider, embeddings_fallback_provider, embeddings_model, embeddings_dimensions,
  timeout_embedding, timeout_chat, timeout_total,
  llm_temperature, llm_max_tokens,
  created_by
) VALUES (
  'kb-quality-analysis-short',
  'Analyse Qualité KB (Courts)',
  'Analyse qualité documents KB courts (<500 chars)',
  'quality',
  'openai',
  '["ollama", "gemini"]'::jsonb,
  '["openai", "ollama", "gemini"]'::jsonb,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  20000,
  40000,
  0.10,
  2000,
  'system-migration'
);

-- -----------------------------------------------------------------------------
-- Vue: statistiques configuration par provider
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_provider_operation_usage AS
SELECT
  p.provider,
  COUNT(DISTINCT opc.operation_name) AS operations_count,
  COUNT(DISTINCT CASE WHEN opc.primary_provider = p.provider THEN opc.operation_name END) AS primary_count,
  COUNT(DISTINCT CASE WHEN opc.fallback_providers @> to_jsonb(p.provider) THEN opc.operation_name END) AS fallback_count,
  COUNT(DISTINCT CASE WHEN opc.enabled_providers @> to_jsonb(p.provider) THEN opc.operation_name END) AS enabled_count,
  array_agg(DISTINCT opc.operation_name) FILTER (WHERE opc.primary_provider = p.provider) AS operations_primary,
  array_agg(DISTINCT opc.operation_name) FILTER (WHERE opc.fallback_providers @> to_jsonb(p.provider)) AS operations_fallback
FROM
  (VALUES ('gemini'), ('groq'), ('deepseek'), ('anthropic'), ('openai'), ('ollama')) AS p(provider)
  LEFT JOIN operation_provider_configs opc ON
    opc.primary_provider = p.provider
    OR opc.fallback_providers @> to_jsonb(p.provider)
    OR opc.enabled_providers @> to_jsonb(p.provider)
GROUP BY p.provider
ORDER BY primary_count DESC, operations_count DESC;

-- -----------------------------------------------------------------------------
-- Commentaires pour documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE operation_provider_configs IS 'Configuration dynamique des providers IA par type d''opération métier';
COMMENT ON TABLE ai_config_change_history IS 'Audit trail complet de tous les changements de configuration IA';
COMMENT ON VIEW vw_provider_operation_usage IS 'Statistiques d''utilisation des providers par opération';

COMMENT ON COLUMN operation_provider_configs.use_static_config IS 'Si true, utilise la config statique (lib/ai/operations-config.ts) au lieu de la DB';
COMMENT ON COLUMN operation_provider_configs.enabled_providers IS 'Liste des providers actifs pour cette opération (JSONB array)';
COMMENT ON COLUMN operation_provider_configs.fallback_providers IS 'Ordre de fallback en cas d''échec du provider primaire';
