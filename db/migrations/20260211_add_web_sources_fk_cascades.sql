-- Migration: Ajouter les contraintes FK ON DELETE CASCADE manquantes
-- Date: 2026-02-11
-- Problème: Les tables enfants de web_sources n'avaient pas de FK CASCADE,
--           causant des erreurs lors de la suppression de sources

BEGIN;

-- ============================================================================
-- web_pages -> web_sources
-- ============================================================================

-- Vérifier si la FK existe déjà
DO $$
BEGIN
  -- Supprimer la FK existante s'il y en a une (sans CASCADE)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_pages_web_source_id_fkey'
    AND table_name = 'web_pages'
  ) THEN
    ALTER TABLE web_pages DROP CONSTRAINT web_pages_web_source_id_fkey;
  END IF;

  -- Créer la FK avec ON DELETE CASCADE
  ALTER TABLE web_pages
    ADD CONSTRAINT web_pages_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_crawl_jobs -> web_sources
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_crawl_jobs_web_source_id_fkey'
    AND table_name = 'web_crawl_jobs'
  ) THEN
    ALTER TABLE web_crawl_jobs DROP CONSTRAINT web_crawl_jobs_web_source_id_fkey;
  END IF;

  ALTER TABLE web_crawl_jobs
    ADD CONSTRAINT web_crawl_jobs_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_crawl_logs -> web_sources
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_crawl_logs_web_source_id_fkey'
    AND table_name = 'web_crawl_logs'
  ) THEN
    ALTER TABLE web_crawl_logs DROP CONSTRAINT web_crawl_logs_web_source_id_fkey;
  END IF;

  ALTER TABLE web_crawl_logs
    ADD CONSTRAINT web_crawl_logs_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_files -> web_sources
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_files_web_source_id_fkey'
    AND table_name = 'web_files'
  ) THEN
    ALTER TABLE web_files DROP CONSTRAINT web_files_web_source_id_fkey;
  END IF;

  ALTER TABLE web_files
    ADD CONSTRAINT web_files_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_page_versions -> web_pages (CASCADE déjà géré par web_pages CASCADE)
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_page_versions_web_page_id_fkey'
    AND table_name = 'web_page_versions'
  ) THEN
    ALTER TABLE web_page_versions DROP CONSTRAINT web_page_versions_web_page_id_fkey;
  END IF;

  ALTER TABLE web_page_versions
    ADD CONSTRAINT web_page_versions_web_page_id_fkey
    FOREIGN KEY (web_page_id)
    REFERENCES web_pages(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_page_structured_metadata -> web_pages
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_page_structured_metadata_web_page_id_fkey'
    AND table_name = 'web_page_structured_metadata'
  ) THEN
    ALTER TABLE web_page_structured_metadata DROP CONSTRAINT web_page_structured_metadata_web_page_id_fkey;
  END IF;

  ALTER TABLE web_page_structured_metadata
    ADD CONSTRAINT web_page_structured_metadata_web_page_id_fkey
    FOREIGN KEY (web_page_id)
    REFERENCES web_pages(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- source_classification_rules -> web_sources
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'source_classification_rules_web_source_id_fkey'
    AND table_name = 'source_classification_rules'
  ) THEN
    ALTER TABLE source_classification_rules DROP CONSTRAINT source_classification_rules_web_source_id_fkey;
  END IF;

  ALTER TABLE source_classification_rules
    ADD CONSTRAINT source_classification_rules_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- web_source_ban_status -> web_sources
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'web_source_ban_status_web_source_id_fkey'
    AND table_name = 'web_source_ban_status'
  ) THEN
    ALTER TABLE web_source_ban_status DROP CONSTRAINT web_source_ban_status_web_source_id_fkey;
  END IF;

  ALTER TABLE web_source_ban_status
    ADD CONSTRAINT web_source_ban_status_web_source_id_fkey
    FOREIGN KEY (web_source_id)
    REFERENCES web_sources(id)
    ON DELETE CASCADE;
END $$;

-- ============================================================================
-- Vérification finale
-- ============================================================================

-- Afficher toutes les FK vers web_sources avec leur règle CASCADE
SELECT
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name IN (
    'web_pages',
    'web_crawl_jobs',
    'web_crawl_logs',
    'web_files',
    'source_classification_rules',
    'web_source_ban_status'
  )
  AND kcu.column_name LIKE '%web_source_id%'
ORDER BY tc.table_name;

COMMIT;

-- ============================================================================
-- Notes d'application
-- ============================================================================
--
-- Local: psql -U moncabinet -d qadhya -f db/migrations/20260211_add_web_sources_fk_cascades.sql
-- Prod:  docker exec -i qadhya-postgres psql -U moncabinet -d qadhya < db/migrations/20260211_add_web_sources_fk_cascades.sql
