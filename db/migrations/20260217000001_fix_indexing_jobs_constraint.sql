-- Migration: Fix indexing_jobs CHECK constraint
-- Date: 2026-02-17
-- Description: Ajouter les types manquants (kb_quality_analysis, kb_duplicate_check) à la contrainte job_type
--
-- Problème:
-- - La contrainte actuelle ne contient que 3-4 types
-- - Les jobs KB Quality bloqués car type non autorisé
-- - Erreur: new row violates check constraint "indexing_jobs_job_type_check"
--
-- Solution:
-- - Supprimer ancienne contrainte
-- - Recréer avec TOUS les 7 types de jobs

-- Étape 1: Supprimer ancienne contrainte si elle existe
ALTER TABLE indexing_jobs
DROP CONSTRAINT IF EXISTS indexing_jobs_job_type_check;

-- Étape 2: Recréer contrainte avec tous les types
-- Types supportés:
--   - document: Indexation document utilisateur standard
--   - knowledge_base: Indexation document base de connaissances
--   - reindex: Réindexation complète (reconstruction embeddings)
--   - kb_quality_analysis: Analyse qualité KB (score 0-100, LLM)
--   - kb_duplicate_check: Détection doublons KB (similarité sémantique)
--   - classify_pages: Classification automatique pages web
--   - web_page_indexing: Indexation pages web crawlées
ALTER TABLE indexing_jobs
ADD CONSTRAINT indexing_jobs_job_type_check
CHECK (job_type = ANY (ARRAY[
  'document'::text,
  'knowledge_base'::text,
  'reindex'::text,
  'kb_quality_analysis'::text,
  'kb_duplicate_check'::text,
  'classify_pages'::text,
  'web_page_indexing'::text
]));

-- Vérification: Compter jobs par type
-- (Cette requête ne modifie rien, juste pour validation post-migration)
DO $$
DECLARE
  stats RECORD;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE job_type = 'document') as document_count,
    COUNT(*) FILTER (WHERE job_type = 'knowledge_base') as kb_count,
    COUNT(*) FILTER (WHERE job_type = 'kb_quality_analysis') as quality_count,
    COUNT(*) FILTER (WHERE job_type = 'kb_duplicate_check') as duplicate_count,
    COUNT(*) FILTER (WHERE job_type = 'classify_pages') as classify_count,
    COUNT(*) FILTER (WHERE job_type = 'web_page_indexing') as web_count,
    COUNT(*) as total_count
  INTO stats
  FROM indexing_jobs;

  RAISE NOTICE 'Migration 20260217000001 appliquée avec succès';
  RAISE NOTICE 'Stats jobs: % total, % kb_quality, % kb_duplicate',
    stats.total_count, stats.quality_count, stats.duplicate_count;
END $$;

-- Commentaire sur la contrainte (documentation PostgreSQL)
COMMENT ON CONSTRAINT indexing_jobs_job_type_check ON indexing_jobs IS
  'CHECK constraint autorisant 7 types de jobs: document, knowledge_base, reindex, kb_quality_analysis, kb_duplicate_check, classify_pages, web_page_indexing';
