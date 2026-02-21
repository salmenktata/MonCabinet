-- Migration: Ajouter le cron kb-quality-maintenance au dashboard monitoring
-- Date: 2026-02-22
-- Description: Enregistre le cron de maintenance qualité KB quotidien (6h30)

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
VALUES (
  'kb-quality-maintenance',
  'Maintenance Qualité KB',
  'Maintenance quotidienne KB : fill quality scores (5×50 docs) → rechunk large (3×5) → reindex articles (2×3)',
  '30 6 * * *',
  1800000,
  true,
  true
)
ON CONFLICT (cron_name) DO UPDATE SET
  display_name    = EXCLUDED.display_name,
  description     = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  timeout_ms      = EXCLUDED.timeout_ms,
  alert_on_failure = EXCLUDED.alert_on_failure,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();
