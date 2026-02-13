-- Migration : Ajouter 'classify_pages' à la contrainte CHECK job_type
-- Date : 2026-02-13
-- Problème : La contrainte indexing_jobs_job_type_check ne contient pas 'classify_pages'
-- Solution : Recréer la contrainte avec la valeur ajoutée

BEGIN;

-- 1. Supprimer ancienne contrainte
ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

-- 2. Créer nouvelle contrainte avec 'classify_pages' ajouté
ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text
]));

-- 3. Vérifier la contrainte
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'indexing_jobs_job_type_check';

COMMIT;
