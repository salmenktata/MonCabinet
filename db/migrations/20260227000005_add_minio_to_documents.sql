-- Migration: Ajouter support MinIO pour les documents de dossiers
-- Date: 2026-02-27
-- Description: Remplace Google Drive par MinIO comme storage provider pour les documents de dossiers clients

-- Ajouter colonne minio_path
ALTER TABLE documents ADD COLUMN IF NOT EXISTS minio_path TEXT;

-- Étendre le CHECK constraint pour accepter 'minio'
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_storage_provider_check;
ALTER TABLE documents ADD CONSTRAINT documents_storage_provider_check
  CHECK (storage_provider IN ('google_drive', 'minio', 'supabase'));

-- Index sur minio_path pour accès rapide
CREATE INDEX IF NOT EXISTS idx_documents_minio_path ON documents(minio_path)
  WHERE minio_path IS NOT NULL;

-- Commentaires
COMMENT ON COLUMN documents.minio_path IS 'Chemin objet dans le bucket MinIO "dossiers" (ex: {userId}/{dossierId}/{timestamp}_{filename})';
