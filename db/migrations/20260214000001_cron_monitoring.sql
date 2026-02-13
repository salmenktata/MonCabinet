-- Migration: Système de Monitoring Crons & Batches
-- Date: 2026-02-14
-- Description: Tables et fonctions pour tracker l'exécution des crons automatiques et batches

-- =====================================================
-- 1. TABLE: cron_executions (Historique)
-- =====================================================
CREATE TABLE IF NOT EXISTS cron_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  exit_code INTEGER,
  output JSONB DEFAULT '{}',
  error_message TEXT,
  triggered_by TEXT DEFAULT 'scheduled',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes (7 derniers jours)
CREATE INDEX IF NOT EXISTS idx_cron_executions_recent
  ON cron_executions(started_at DESC)
  WHERE started_at >= NOW() - INTERVAL '7 days';

-- Index pour crons en cours
CREATE INDEX IF NOT EXISTS idx_cron_executions_running
  ON cron_executions(cron_name, started_at DESC)
  WHERE status = 'running';

-- Index pour stats par cron
CREATE INDEX IF NOT EXISTS idx_cron_executions_by_name
  ON cron_executions(cron_name, status, started_at DESC);

COMMENT ON TABLE cron_executions IS 'Historique d''exécution de tous les crons automatiques';
COMMENT ON COLUMN cron_executions.triggered_by IS 'Source du déclenchement: scheduled, manual, webhook';
COMMENT ON COLUMN cron_executions.output IS 'Résultats JSON du cron (métriques, actions effectuées, etc.)';

-- =====================================================
-- 2. TABLE: cron_schedules (Configuration)
-- =====================================================
CREATE TABLE IF NOT EXISTS cron_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  cron_expression TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  timeout_ms INTEGER DEFAULT 120000,
  alert_on_failure BOOLEAN DEFAULT true,
  last_execution_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  success_rate_7d NUMERIC(5,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cron_schedules IS 'Configuration et métriques agrégées des crons';
COMMENT ON COLUMN cron_schedules.timeout_ms IS 'Timeout max en ms avant alerte stuck (défaut 2min)';
COMMENT ON COLUMN cron_schedules.consecutive_failures IS 'Nombre d''échecs consécutifs (reset à 0 au succès)';
COMMENT ON COLUMN cron_schedules.success_rate_7d IS 'Taux de succès sur 7 derniers jours (%)';

-- =====================================================
-- 3. VUE: vw_batch_executions_unified (Consolidation)
-- =====================================================
CREATE OR REPLACE VIEW vw_batch_executions_unified AS
SELECT
  'indexing' as batch_type,
  id,
  job_type,
  status,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) * 1000 as duration_ms,
  metadata,
  created_at
FROM indexing_jobs
WHERE started_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'crawl' as batch_type,
  id,
  job_type,
  status,
  started_at,
  completed_at,
  EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) * 1000 as duration_ms,
  params as metadata,
  created_at
FROM web_crawl_jobs
WHERE started_at >= NOW() - INTERVAL '7 days'

ORDER BY started_at DESC;

COMMENT ON VIEW vw_batch_executions_unified IS 'Vue consolidée de tous les batches (indexing + crawl) 7 derniers jours';

-- =====================================================
-- 4. FONCTION: get_cron_monitoring_stats()
-- =====================================================
CREATE OR REPLACE FUNCTION get_cron_monitoring_stats(
  hours_back INTEGER DEFAULT 24
)
RETURNS TABLE (
  cron_name TEXT,
  total_executions BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  running_count BIGINT,
  success_rate NUMERIC(5,2),
  avg_duration_ms INTEGER,
  max_duration_ms INTEGER,
  last_execution_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH stats AS (
    SELECT
      ce.cron_name,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ce.status = 'completed') as completed,
      COUNT(*) FILTER (WHERE ce.status = 'failed') as failed,
      COUNT(*) FILTER (WHERE ce.status = 'running') as running,
      ROUND(
        (COUNT(*) FILTER (WHERE ce.status = 'completed')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
        2
      ) as success_pct,
      ROUND(AVG(ce.duration_ms) FILTER (WHERE ce.status = 'completed'))::INTEGER as avg_dur,
      MAX(ce.duration_ms) FILTER (WHERE ce.status = 'completed') as max_dur,
      MAX(ce.started_at) as last_exec,
      MAX(ce.completed_at) FILTER (WHERE ce.status = 'completed') as last_succ,
      MAX(ce.completed_at) FILTER (WHERE ce.status = 'failed') as last_fail
    FROM cron_executions ce
    WHERE ce.started_at >= NOW() - (hours_back || ' hours')::INTERVAL
    GROUP BY ce.cron_name
  ),
  consecutive AS (
    SELECT DISTINCT ON (ce.cron_name)
      ce.cron_name,
      COUNT(*) FILTER (WHERE ce.status = 'failed') OVER (
        PARTITION BY ce.cron_name
        ORDER BY ce.started_at DESC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) as consec_fails
    FROM cron_executions ce
    WHERE ce.started_at >= NOW() - INTERVAL '7 days'
      AND ce.status IN ('completed', 'failed')
    ORDER BY ce.cron_name, ce.started_at DESC
  )
  SELECT
    s.cron_name,
    s.total,
    s.completed,
    s.failed,
    s.running,
    s.success_pct,
    s.avg_dur,
    s.max_dur,
    s.last_exec,
    s.last_succ,
    s.last_fail,
    COALESCE(c.consec_fails, 0)::INTEGER
  FROM stats s
  LEFT JOIN consecutive c ON c.cron_name = s.cron_name
  ORDER BY s.last_exec DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_cron_monitoring_stats IS 'Stats agrégées par cron sur N dernières heures';

-- =====================================================
-- 5. FONCTION: detect_stuck_crons()
-- =====================================================
CREATE OR REPLACE FUNCTION detect_stuck_crons()
RETURNS TABLE (
  execution_id UUID,
  cron_name TEXT,
  started_at TIMESTAMPTZ,
  running_duration_ms INTEGER,
  timeout_ms INTEGER,
  exceeded_by_ms INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id,
    ce.cron_name,
    ce.started_at,
    EXTRACT(EPOCH FROM (NOW() - ce.started_at))::INTEGER * 1000 as running_dur,
    COALESCE(cs.timeout_ms, 120000) as timeout,
    (EXTRACT(EPOCH FROM (NOW() - ce.started_at))::INTEGER * 1000) - COALESCE(cs.timeout_ms, 120000) as exceeded
  FROM cron_executions ce
  LEFT JOIN cron_schedules cs ON cs.cron_name = ce.cron_name
  WHERE ce.status = 'running'
    AND (NOW() - ce.started_at) > (COALESCE(cs.timeout_ms, 120000) || ' milliseconds')::INTERVAL
  ORDER BY ce.started_at ASC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION detect_stuck_crons IS 'Détecte les crons bloqués au-delà du timeout configuré';

-- =====================================================
-- 6. FONCTION: cleanup_old_cron_executions()
-- =====================================================
CREATE OR REPLACE FUNCTION cleanup_old_cron_executions(
  retention_days INTEGER DEFAULT 7
)
RETURNS TABLE (
  deleted_count INTEGER,
  oldest_kept TIMESTAMPTZ
) AS $$
DECLARE
  v_deleted INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  DELETE FROM cron_executions
  WHERE started_at < NOW() - (retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT MIN(started_at) INTO v_oldest
  FROM cron_executions;

  RETURN QUERY SELECT v_deleted, v_oldest;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_cron_executions IS 'Supprime les exécutions plus anciennes que N jours (défaut 7)';

-- =====================================================
-- 7. TRIGGER: update_cron_schedules_stats
-- =====================================================
CREATE OR REPLACE FUNCTION update_cron_schedules_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Mise à jour stats uniquement si exécution terminée (completed ou failed)
  IF NEW.status IN ('completed', 'failed') AND OLD.status = 'running' THEN
    UPDATE cron_schedules
    SET
      last_execution_at = NEW.started_at,
      last_success_at = CASE
        WHEN NEW.status = 'completed' THEN NEW.completed_at
        ELSE last_success_at
      END,
      consecutive_failures = CASE
        WHEN NEW.status = 'completed' THEN 0
        WHEN NEW.status = 'failed' THEN consecutive_failures + 1
        ELSE consecutive_failures
      END,
      updated_at = NOW()
    WHERE cron_name = NEW.cron_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cron_schedules_stats
  AFTER UPDATE ON cron_executions
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'failed') AND OLD.status = 'running')
  EXECUTE FUNCTION update_cron_schedules_stats();

COMMENT ON FUNCTION update_cron_schedules_stats IS 'Mise à jour auto des stats dans cron_schedules après chaque exécution';

-- =====================================================
-- 8. SEED: Configuration initiale des 6 crons
-- =====================================================
INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure)
VALUES
  (
    'monitor-openai',
    'Monitor OpenAI Budget',
    'Vérifie le budget OpenAI et envoie alertes si seuils dépassés',
    '0 9 * * *',
    60000,
    true
  ),
  (
    'check-alerts',
    'Check System Alerts',
    'Vérifie tous les systèmes d''alerte (KB quality, batches, budgets)',
    '0 * * * *',
    120000,
    true
  ),
  (
    'refresh-mv-metadata',
    'Refresh Metadata Views',
    'Rafraîchit les vues matérialisées de métadonnées système',
    '*/15 * * * *',
    300000,
    false
  ),
  (
    'reanalyze-kb-failures',
    'Reanalyze KB Failures',
    'Réanalyse les documents KB avec score=50 (quotidien)',
    '0 2 * * *',
    3600000,
    true
  ),
  (
    'index-kb',
    'Index Knowledge Base',
    'Indexation progressive KB (2 docs toutes les 5min)',
    '*/5 * * * *',
    240000,
    false
  ),
  (
    'acquisition-weekly',
    'Weekly Acquisition Report',
    'Génère le rapport hebdomadaire d''acquisition clients',
    '0 8 * * 1',
    600000,
    true
  )
ON CONFLICT (cron_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  timeout_ms = EXCLUDED.timeout_ms,
  alert_on_failure = EXCLUDED.alert_on_failure,
  updated_at = NOW();

-- =====================================================
-- 9. FONCTION: get_next_cron_execution()
-- =====================================================
-- Note: Calcul simplifié, pour calcul exact utiliser librairie externe
CREATE OR REPLACE FUNCTION get_next_cron_execution(
  p_cron_name TEXT
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_cron_expr TEXT;
  v_last_exec TIMESTAMPTZ;
  v_next_exec TIMESTAMPTZ;
BEGIN
  SELECT cron_expression, last_execution_at
  INTO v_cron_expr, v_last_exec
  FROM cron_schedules
  WHERE cron_name = p_cron_name;

  -- Calcul simplifié basé sur patterns communs
  -- Pour calcul exact, utiliser extension pg_cron ou calcul côté application
  CASE
    WHEN v_cron_expr LIKE '*/5 * * * *' THEN
      v_next_exec := date_trunc('hour', NOW()) +
        (FLOOR(EXTRACT(MINUTE FROM NOW()) / 5) + 1) * INTERVAL '5 minutes';
    WHEN v_cron_expr LIKE '*/15 * * * *' THEN
      v_next_exec := date_trunc('hour', NOW()) +
        (FLOOR(EXTRACT(MINUTE FROM NOW()) / 15) + 1) * INTERVAL '15 minutes';
    WHEN v_cron_expr LIKE '0 * * * *' THEN
      v_next_exec := date_trunc('hour', NOW()) + INTERVAL '1 hour';
    WHEN v_cron_expr LIKE '0 % * * *' THEN
      -- Pattern horaire (ex: 0 9 * * *)
      v_next_exec := date_trunc('day', NOW()) +
        (SUBSTRING(v_cron_expr FROM '0 (\d+)')::INTEGER || ' hours')::INTERVAL;
      IF v_next_exec < NOW() THEN
        v_next_exec := v_next_exec + INTERVAL '1 day';
      END IF;
    ELSE
      -- Fallback: estimation basée sur dernière exécution
      v_next_exec := COALESCE(v_last_exec, NOW()) + INTERVAL '1 hour';
  END CASE;

  RETURN v_next_exec;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_next_cron_execution IS 'Estime la prochaine exécution d''un cron (calcul simplifié)';

-- =====================================================
-- 10. VUE: vw_cron_monitoring_dashboard
-- =====================================================
CREATE OR REPLACE VIEW vw_cron_monitoring_dashboard AS
SELECT
  cs.cron_name,
  cs.display_name,
  cs.description,
  cs.cron_expression,
  cs.is_enabled,
  cs.timeout_ms,
  cs.last_execution_at,
  cs.last_success_at,
  cs.consecutive_failures,
  cs.avg_duration_ms,
  cs.success_rate_7d,
  get_next_cron_execution(cs.cron_name) as next_execution_at,
  (
    SELECT COUNT(*)
    FROM cron_executions ce
    WHERE ce.cron_name = cs.cron_name
      AND ce.status = 'running'
  ) as running_count,
  (
    SELECT COUNT(*)
    FROM cron_executions ce
    WHERE ce.cron_name = cs.cron_name
      AND ce.status = 'failed'
      AND ce.started_at >= NOW() - INTERVAL '24 hours'
  ) as failures_24h
FROM cron_schedules cs
ORDER BY cs.last_execution_at DESC NULLS LAST;

COMMENT ON VIEW vw_cron_monitoring_dashboard IS 'Vue dashboard avec toutes les métriques pour monitoring UI';

-- =====================================================
-- 11. GRANTS (Permissions)
-- =====================================================
-- Accorder les permissions nécessaires à l'utilisateur de l'application
-- GRANT SELECT, INSERT, UPDATE ON cron_executions TO app_user;
-- GRANT SELECT ON cron_schedules TO app_user;
-- GRANT SELECT ON vw_batch_executions_unified TO app_user;
-- GRANT SELECT ON vw_cron_monitoring_dashboard TO app_user;
-- GRANT EXECUTE ON FUNCTION get_cron_monitoring_stats TO app_user;
-- GRANT EXECUTE ON FUNCTION detect_stuck_crons TO app_user;
