-- Migration: Ajouter le cron de détection des contradictions
-- Date: 2026-03-02
-- Description: Enregistre le cron detect-contradictions dans cron_schedules
--   Batch de 5 pages/run via Ollama embedding + LLM — nuit à 4h (après index-kb à 3h)

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
VALUES (
  'detect-contradictions',
  'Détection Contradictions',
  'Détecte les contradictions entre contenus juridiques indexés — batch de 5 pages/run, via embedding Ollama + LLM',
  '0 4 * * *',
  310000,
  true,
  true
)
ON CONFLICT (cron_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  timeout_ms = EXCLUDED.timeout_ms,
  alert_on_failure = EXCLUDED.alert_on_failure,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
