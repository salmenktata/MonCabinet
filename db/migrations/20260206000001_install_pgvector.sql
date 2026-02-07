/**
 * Migration: Installation pgvector
 * Date: 2026-02-06
 * Description: Installer l'extension pgvector pour le stockage et la recherche vectorielle
 */

-- Installer l'extension pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Vérification
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE '✅ Extension pgvector installée avec succès!';
  ELSE
    RAISE EXCEPTION '❌ Échec installation pgvector';
  END IF;
END $$;
