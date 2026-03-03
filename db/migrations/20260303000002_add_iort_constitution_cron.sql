-- Migration: Ajouter cron mensuel IORT constitution refresh + fix KB catégorie
-- Date: 2026-03-03
-- Description: (1) Corrige la KB IORT constitution mal catégorisée ('autre' → 'constitution')
--              (2) Ajoute normLevel='constitution' aux 139 chunks existants
--              (3) Enregistre le cron de mise à jour automatique mensuelle

-- Fix KB IORT constitution mal catégorisée (crawl Mar 3 2026)
UPDATE knowledge_base
SET
  category = 'constitution',
  title = 'دستور الجمهورية التونسية 2022',
  metadata = metadata || '{"normLevel": "constitution", "sourceOrigin": "iort_gov_tn"}'::jsonb
WHERE id = '8c3e1fa7-d082-41d3-84ad-db253796b57c';

-- Fix normLevel dans les 139 chunks IORT constitution
UPDATE knowledge_base_chunks
SET metadata = metadata || '{"normLevel": "constitution"}'::jsonb
WHERE knowledge_base_id = '8c3e1fa7-d082-41d3-84ad-db253796b57c';

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
