/**
 * Migration: scheduled_cron_executions
 * Phase 6.1: Scheduling Custom - Table des exécutions planifiées
 * Date: 2026-02-14
 */

-- Table des crons planifiés pour exécution future
CREATE TABLE IF NOT EXISTS scheduled_cron_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  parameters JSONB DEFAULT '{}',

  -- Metadata
  created_by TEXT, -- User email ou 'system'
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- État
  status TEXT CHECK (status IN ('pending', 'triggered', 'cancelled', 'failed')) DEFAULT 'pending',
  triggered_at TIMESTAMPTZ,
  triggered_execution_id UUID REFERENCES cron_executions(id),

  -- Logs erreur
  error_message TEXT,

  -- Repeat (futur - Phase 7 ?)
  -- repeat_pattern TEXT, -- 'daily', 'weekly', 'monthly'
  -- repeat_until TIMESTAMPTZ,

  CONSTRAINT valid_scheduled_at CHECK (scheduled_at > NOW() OR status != 'pending')
);

-- Index pour performance (query toutes les minutes)
CREATE INDEX idx_scheduled_crons_pending ON scheduled_cron_executions(scheduled_at)
  WHERE status = 'pending';

CREATE INDEX idx_scheduled_crons_recent ON scheduled_cron_executions(created_at DESC)
  WHERE created_at >= NOW() - INTERVAL '30 days';

-- Fonction: Récupérer les crons prêts à être déclenchés
CREATE OR REPLACE FUNCTION get_ready_scheduled_crons()
RETURNS TABLE (
  id UUID,
  cron_name TEXT,
  scheduled_at TIMESTAMPTZ,
  parameters JSONB,
  created_by TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.cron_name,
    sc.scheduled_at,
    sc.parameters,
    sc.created_by
  FROM scheduled_cron_executions sc
  WHERE sc.status = 'pending'
    AND sc.scheduled_at <= NOW()
  ORDER BY sc.scheduled_at ASC
  FOR UPDATE SKIP LOCKED; -- Évite race conditions
END;
$$ LANGUAGE plpgsql;

-- Fonction: Marquer un cron planifié comme déclenché
CREATE OR REPLACE FUNCTION mark_scheduled_cron_triggered(
  p_id UUID,
  p_execution_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE scheduled_cron_executions
  SET status = 'triggered',
      triggered_at = NOW(),
      triggered_execution_id = p_execution_id
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Marquer un cron planifié comme échoué
CREATE OR REPLACE FUNCTION mark_scheduled_cron_failed(
  p_id UUID,
  p_error TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE scheduled_cron_executions
  SET status = 'failed',
      triggered_at = NOW(),
      error_message = p_error
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Fonction: Nettoyer anciens crons planifiés (triggered/cancelled > 30j)
CREATE OR REPLACE FUNCTION cleanup_old_scheduled_crons()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM scheduled_cron_executions
  WHERE status IN ('triggered', 'cancelled', 'failed')
    AND created_at < NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Vue: Résumé des crons planifiés
CREATE OR REPLACE VIEW vw_scheduled_crons_summary AS
SELECT
  sc.id,
  sc.cron_name,
  sc.scheduled_at,
  sc.created_at,
  sc.created_by,
  sc.status,
  sc.parameters,

  -- Temps avant exécution (ou null si déjà déclenché)
  CASE
    WHEN sc.status = 'pending' THEN EXTRACT(EPOCH FROM (sc.scheduled_at - NOW()))
    ELSE NULL
  END AS seconds_until_execution,

  -- Temps écoulé depuis création
  EXTRACT(EPOCH FROM (NOW() - sc.created_at)) AS seconds_since_created,

  -- Info exécution si déclenchée
  sc.triggered_at,
  ce.status AS execution_status,
  ce.duration_ms AS execution_duration_ms
FROM scheduled_cron_executions sc
LEFT JOIN cron_executions ce ON ce.id = sc.triggered_execution_id
ORDER BY sc.scheduled_at ASC;

COMMENT ON TABLE scheduled_cron_executions IS 'Phase 6.1: Crons planifiés pour exécution future';
COMMENT ON COLUMN scheduled_cron_executions.scheduled_at IS 'Date/heure d''exécution planifiée (UTC)';
COMMENT ON COLUMN scheduled_cron_executions.parameters IS 'Phase 6.2: Paramètres JSON à passer au cron';
COMMENT ON COLUMN scheduled_cron_executions.status IS 'pending: en attente, triggered: déclenché, cancelled: annulé, failed: échec déclenchement';
