-- Migration: Fiabiliser le système de crons
-- Date: 2026-03-04
-- Description:
--   (1) Trigger recalcule success_rate_7d + avg_duration_ms (étaient toujours NULL)
--   (2) Auto-cleanup des crons stuck : marque 'failed' les exécutions running > 2x leur timeout
--   (3) Corriger les exécutions invalides status='success'/'error' déjà en DB

-- =====================================================
-- 1. Corriger les statuts invalides déjà en DB
-- =====================================================
UPDATE cron_executions SET status = 'completed' WHERE status = 'success';
UPDATE cron_executions SET status = 'failed'    WHERE status = 'error';

-- =====================================================
-- 2. Fonction auto-cleanup stuck crons
--    Appelée au début de chaque nouvelle exécution via trigger
-- =====================================================
CREATE OR REPLACE FUNCTION auto_cleanup_stuck_crons()
RETURNS VOID AS $$
BEGIN
  -- Marquer 'failed' tout cron running depuis plus de 2x son timeout configuré
  UPDATE cron_executions ce
  SET
    status = 'failed',
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - ce.started_at))::INTEGER * 1000,
    error_message = 'Auto-terminé : dépassement 2× timeout (' ||
                    COALESCE(cs.timeout_ms, 120000) || 'ms) sans signal de fin'
  FROM cron_schedules cs
  WHERE ce.cron_name = cs.cron_name
    AND ce.status = 'running'
    AND (NOW() - ce.started_at) > (COALESCE(cs.timeout_ms, 120000) * 2 || ' milliseconds')::INTERVAL;

  -- Même chose pour les crons sans entrée dans cron_schedules (fallback 10 min)
  UPDATE cron_executions
  SET
    status = 'failed',
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER * 1000,
    error_message = 'Auto-terminé : running depuis plus de 10 minutes sans signal de fin'
  WHERE status = 'running'
    AND cron_name NOT IN (SELECT cron_name FROM cron_schedules)
    AND (NOW() - started_at) > INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_cleanup_stuck_crons IS 'Marque failed les crons bloqués (>2x timeout). Appelée par le trigger at INSERT.';

-- =====================================================
-- 3. Trigger INSERT : appelle auto_cleanup au démarrage
-- =====================================================
CREATE OR REPLACE FUNCTION trigger_cleanup_stuck_on_start()
RETURNS TRIGGER AS $$
BEGIN
  -- Nettoyer les stuck crons du même nom avant d'en démarrer un nouveau
  UPDATE cron_executions ce
  SET
    status = 'failed',
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - ce.started_at))::INTEGER * 1000,
    error_message = 'Auto-terminé : nouvelle exécution démarrée alors que ce run était encore running'
  FROM cron_schedules cs
  WHERE ce.cron_name = NEW.cron_name
    AND ce.cron_name = cs.cron_name
    AND ce.status = 'running'
    AND ce.id != NEW.id
    AND (NOW() - ce.started_at) > (COALESCE(cs.timeout_ms, 120000) || ' milliseconds')::INTERVAL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cleanup_stuck_on_start ON cron_executions;
CREATE TRIGGER trigger_cleanup_stuck_on_start
  AFTER INSERT ON cron_executions
  FOR EACH ROW
  WHEN (NEW.status = 'running')
  EXECUTE FUNCTION trigger_cleanup_stuck_on_start();

-- =====================================================
-- 4. Améliorer trigger UPDATE : ajouter success_rate_7d + avg_duration_ms
-- =====================================================
CREATE OR REPLACE FUNCTION update_cron_schedules_stats()
RETURNS TRIGGER AS $$
BEGIN
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
      -- Recalcul success_rate_7d sur les 7 derniers jours
      success_rate_7d = (
        SELECT ROUND(
          COUNT(*) FILTER (WHERE ce2.status = 'completed')::NUMERIC
          / NULLIF(COUNT(*), 0) * 100,
          2
        )
        FROM cron_executions ce2
        WHERE ce2.cron_name = NEW.cron_name
          AND ce2.started_at >= NOW() - INTERVAL '7 days'
          AND ce2.status IN ('completed', 'failed')
      ),
      -- Recalcul avg_duration_ms sur les 30 derniers runs complétés
      avg_duration_ms = (
        SELECT ROUND(AVG(ce2.duration_ms))::INTEGER
        FROM (
          SELECT duration_ms
          FROM cron_executions
          WHERE cron_name = NEW.cron_name
            AND status = 'completed'
            AND duration_ms IS NOT NULL
          ORDER BY started_at DESC
          LIMIT 30
        ) ce2
      ),
      updated_at = NOW()
    WHERE cron_name = NEW.cron_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Le trigger existe déjà, juste remplacer la fonction (pas besoin de DROP/CREATE)
COMMENT ON FUNCTION update_cron_schedules_stats IS 'Mise à jour auto stats: last_execution_at, consecutive_failures, success_rate_7d, avg_duration_ms';

-- =====================================================
-- 5. Recalcul initial des stats pour les crons existants
-- =====================================================
UPDATE cron_schedules cs
SET
  success_rate_7d = (
    SELECT ROUND(
      COUNT(*) FILTER (WHERE ce.status = 'completed')::NUMERIC
      / NULLIF(COUNT(*), 0) * 100,
      2
    )
    FROM cron_executions ce
    WHERE ce.cron_name = cs.cron_name
      AND ce.started_at >= NOW() - INTERVAL '7 days'
      AND ce.status IN ('completed', 'failed')
  ),
  avg_duration_ms = (
    SELECT ROUND(AVG(ce.duration_ms))::INTEGER
    FROM (
      SELECT duration_ms
      FROM cron_executions
      WHERE cron_name = cs.cron_name
        AND status = 'completed'
        AND duration_ms IS NOT NULL
      ORDER BY started_at DESC
      LIMIT 30
    ) ce
  ),
  updated_at = NOW();
