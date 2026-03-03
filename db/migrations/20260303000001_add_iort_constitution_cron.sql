-- Migration: Ajouter cron mensuel IORT constitution refresh
-- Date: 2026-03-03
-- Description: Enregistre le cron de mise à jour automatique mensuelle de la constitution IORT

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
VALUES (
  'iort-constitution-refresh',
  'Refresh Constitution IORT',
  'Crawl mensuel IORT (Rائد الرسمي) : OCR PDF 42 pages, réindexation article par article (~142 فصل), boost RAG ×1.62 (sourceOrigin=iort_gov_tn + normLevel=constitution)',
  '0 3 1 * *',
  660000,
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
