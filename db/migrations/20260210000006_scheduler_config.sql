-- Migration: Configuration du scheduler automatique
-- Date: 2026-02-10
-- Description: Table de configuration et colonnes scheduler sur web_sources

-- ============================================================================
-- TABLE web_scheduler_config (singleton)
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_scheduler_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- Singleton
  is_enabled BOOLEAN DEFAULT true,
  max_concurrent_crawls INTEGER DEFAULT 2,
  max_crawls_per_hour INTEGER DEFAULT 10,
  default_frequency INTERVAL DEFAULT '24 hours',
  schedule_start_hour INTEGER DEFAULT 0 CHECK (schedule_start_hour >= 0 AND schedule_start_hour <= 23),
  schedule_end_hour INTEGER DEFAULT 23 CHECK (schedule_end_hour >= 0 AND schedule_end_hour <= 23),

  -- Statistiques
  last_run_at TIMESTAMPTZ,
  last_run_result JSONB,
  total_runs INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,

  -- Audit
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insérer la configuration par défaut
INSERT INTO web_scheduler_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- COLONNES SUR web_sources
-- ============================================================================

ALTER TABLE web_sources
  ADD COLUMN IF NOT EXISTS auto_crawl_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_scheduler_error TEXT,
  ADD COLUMN IF NOT EXISTS scheduler_skip_until TIMESTAMPTZ;

-- ============================================================================
-- INDEX
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_web_sources_auto_crawl ON web_sources(auto_crawl_enabled) WHERE auto_crawl_enabled = true;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration scheduler_config terminée';
  RAISE NOTICE 'Table web_scheduler_config créée (singleton)';
  RAISE NOTICE 'Colonnes scheduler ajoutées à web_sources';
END $$;
