-- Migration : Intégration Cloud Storage (Google Drive)
-- Date : 2026-02-05
-- Description : Tables configuration cloud providers, extensions table documents

-- =====================================================
-- 1. TABLE CONFIGURATION CLOUD PROVIDERS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.cloud_providers_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),

  -- OAuth tokens (chiffrés avec pg_crypto)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Configuration
  enabled BOOLEAN DEFAULT true NOT NULL,
  default_provider BOOLEAN DEFAULT true NOT NULL,
  root_folder_id TEXT, -- ID dossier racine "Clients Avocat/"
  root_folder_name TEXT DEFAULT 'Clients Avocat',

  -- Synchronisation bidirectionnelle (sera étendu dans migration suivante)
  sync_enabled BOOLEAN DEFAULT false NOT NULL,
  sync_frequency INTEGER DEFAULT 15 CHECK (sync_frequency IN (15, 30, 60)), -- Minutes

  -- Métadonnées
  provider_email TEXT,
  scopes TEXT[],
  last_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  UNIQUE(user_id, provider)
);

-- Index
CREATE INDEX idx_cloud_providers_user_id ON public.cloud_providers_config(user_id);
CREATE INDEX idx_cloud_providers_enabled ON public.cloud_providers_config(enabled) WHERE enabled = true;

-- RLS Policies
ALTER TABLE public.cloud_providers_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cloud configs"
  ON public.cloud_providers_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger auto-update updated_at
CREATE TRIGGER update_cloud_providers_config_updated_at
  BEFORE UPDATE ON public.cloud_providers_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. EXTENSIONS TABLE DOCUMENTS
-- =====================================================

-- Ajouter colonnes cloud storage
ALTER TABLE public.documents
ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'google_drive' CHECK (storage_provider IN ('google_drive', 'supabase')),
ADD COLUMN IF NOT EXISTS external_file_id TEXT,
ADD COLUMN IF NOT EXISTS external_folder_client_id TEXT, -- ID dossier client Google Drive
ADD COLUMN IF NOT EXISTS external_folder_dossier_id TEXT, -- ID dossier juridique Google Drive
ADD COLUMN IF NOT EXISTS external_sharing_link TEXT,
ADD COLUMN IF NOT EXISTS external_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'whatsapp', 'google_drive_sync')),
ADD COLUMN IF NOT EXISTS source_metadata JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS needs_classification BOOLEAN DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP WITH TIME ZONE;

-- Rendre storage_path optionnel (plus obligatoire pour Google Drive)
ALTER TABLE public.documents
ALTER COLUMN storage_path DROP NOT NULL;

-- Contrainte : Si storage_provider = 'google_drive', external_file_id requis
-- Cette contrainte sera ajoutée après migration données existantes

-- Index
CREATE INDEX IF NOT EXISTS idx_documents_storage_provider ON public.documents(storage_provider);
CREATE INDEX IF NOT EXISTS idx_documents_external_file_id ON public.documents(external_file_id) WHERE external_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_source_type ON public.documents(source_type);
CREATE INDEX IF NOT EXISTS idx_documents_needs_classification ON public.documents(needs_classification) WHERE needs_classification = true;

-- =====================================================
-- 3. EXTENSIONS TABLE CLIENTS (Préparer pour téléphone normalisé)
-- =====================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS telephone_normalized TEXT, -- Format E.164 (+21612345678)
ADD COLUMN IF NOT EXISTS google_drive_folder_id TEXT, -- ID dossier client dans Google Drive
ADD COLUMN IF NOT EXISTS google_drive_folder_url TEXT; -- Lien direct dossier client

-- Index téléphone normalisé pour recherche rapide (WhatsApp)
CREATE INDEX IF NOT EXISTS idx_clients_telephone_normalized ON public.clients(telephone_normalized) WHERE telephone_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_google_drive_folder_id ON public.clients(google_drive_folder_id) WHERE google_drive_folder_id IS NOT NULL;

-- =====================================================
-- 4. EXTENSIONS TABLE DOSSIERS (Google Drive folders)
-- =====================================================

ALTER TABLE public.dossiers
ADD COLUMN IF NOT EXISTS google_drive_folder_id TEXT, -- ID dossier juridique dans Google Drive
ADD COLUMN IF NOT EXISTS google_drive_folder_url TEXT; -- Lien direct dossier juridique

CREATE INDEX IF NOT EXISTS idx_dossiers_google_drive_folder_id ON public.dossiers(google_drive_folder_id) WHERE google_drive_folder_id IS NOT NULL;

-- =====================================================
-- 5. COMMENTAIRES
-- =====================================================

COMMENT ON TABLE public.cloud_providers_config IS 'Configuration OAuth cloud providers (Google Drive, OneDrive, Dropbox)';
COMMENT ON COLUMN public.cloud_providers_config.provider IS 'Type de provider : google_drive uniquement pour MVP';
COMMENT ON COLUMN public.cloud_providers_config.root_folder_id IS 'ID dossier racine "Clients Avocat/" dans Google Drive';
COMMENT ON COLUMN public.cloud_providers_config.sync_enabled IS 'Activer synchronisation bidirectionnelle Google Drive → Plateforme';
COMMENT ON COLUMN public.cloud_providers_config.sync_frequency IS 'Fréquence polling synchronisation (15/30/60 min)';

COMMENT ON COLUMN public.documents.storage_provider IS 'Provider stockage : google_drive (défaut) ou supabase (legacy)';
COMMENT ON COLUMN public.documents.external_file_id IS 'ID fichier dans Google Drive (obligatoire si storage_provider=google_drive)';
COMMENT ON COLUMN public.documents.external_folder_client_id IS 'ID dossier client dans Google Drive (ex: [DUPONT Jean - CIN 12345678]/)';
COMMENT ON COLUMN public.documents.external_folder_dossier_id IS 'ID dossier juridique dans Google Drive (ex: Dossier 2025-001/)';
COMMENT ON COLUMN public.documents.external_sharing_link IS 'Lien partageable Google Drive (généré automatiquement)';
COMMENT ON COLUMN public.documents.source_type IS 'Source document : manual (upload plateforme), whatsapp (reçu par WhatsApp), google_drive_sync (ajouté manuellement dans Google Drive)';
COMMENT ON COLUMN public.documents.needs_classification IS 'Document en attente de classification manuelle (true si dans "Documents non classés/")';

COMMENT ON COLUMN public.clients.telephone_normalized IS 'Téléphone format E.164 pour matching WhatsApp (+21612345678)';
COMMENT ON COLUMN public.clients.google_drive_folder_id IS 'ID dossier client dans Google Drive (ex: [DUPONT Jean - CIN 12345678]/)';

COMMENT ON COLUMN public.dossiers.google_drive_folder_id IS 'ID dossier juridique dans Google Drive (ex: Dossier 2025-001/)';
