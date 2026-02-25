-- Migration: Ajouter contradiction_check au CHECK constraint de indexing_jobs
-- Date: 2026-02-25
-- Raison: contradiction_check manquait dans la contrainte (fix migration 20260217000001
--         avait oublié ce type). Requis pour tracker les pages vérifiées sans contradictions.

ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text,
  'web_page_indexing'::text,
  'contradiction_check'::text,
  'content_analysis'::text,
  'legal_classification'::text,
  'full_pipeline'::text
]));

COMMENT ON CONSTRAINT indexing_jobs_job_type_check ON indexing_jobs IS
  'Tous les types de jobs supportés dont contradiction_check (ajouté 2026-02-25)';
