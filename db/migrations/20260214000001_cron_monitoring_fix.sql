-- Fix pour l'index idx_cron_executions_recent
-- Supprime l'index créé avec NOW() (non-IMMUTABLE) et le recrée sans prédicat WHERE

DROP INDEX IF EXISTS idx_cron_executions_recent;

CREATE INDEX IF NOT EXISTS idx_cron_executions_recent
  ON cron_executions(started_at DESC);

COMMENT ON INDEX idx_cron_executions_recent IS 'Index pour requêtes chronologiques récentes (cleanup 7j limite la taille)';
