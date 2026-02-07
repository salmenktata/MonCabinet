-- Migration : Synchronisation Bidirectionnelle Google Drive
-- Date : 2026-02-05
-- Description : Table logs synchronisation, extensions cloud_providers_config pour webhooks Google Drive

-- =====================================================
-- 1. TABLE LOGS SYNCHRONISATION
-- =====================================================

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),

  -- Informations synchronisation
  sync_type TEXT NOT NULL CHECK (sync_type IN ('webhook', 'polling', 'manual')),
  sync_status TEXT NOT NULL CHECK (sync_status IN ('started', 'success', 'partial', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER, -- Durée en millisecondes

  -- Statistiques
  files_scanned INTEGER DEFAULT 0 NOT NULL,
  files_added INTEGER DEFAULT 0 NOT NULL,
  files_updated INTEGER DEFAULT 0 NOT NULL,
  files_deleted INTEGER DEFAULT 0 NOT NULL,
  files_needs_classification INTEGER DEFAULT 0 NOT NULL,

  -- Erreurs
  error_message TEXT,
  error_details JSONB,

  -- Métadonnées
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Index
CREATE INDEX idx_sync_logs_user_id ON public.sync_logs(user_id);
CREATE INDEX idx_sync_logs_provider ON public.sync_logs(provider);
CREATE INDEX idx_sync_logs_sync_status ON public.sync_logs(sync_status);
CREATE INDEX idx_sync_logs_started_at ON public.sync_logs(started_at DESC);

-- RLS Policies
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync logs"
  ON public.sync_logs FOR SELECT
  USING (auth.uid() = user_id);

-- =====================================================
-- 2. EXTENSIONS TABLE CLOUD_PROVIDERS_CONFIG
-- =====================================================

-- Ajouter colonnes webhook Google Drive Push Notifications
ALTER TABLE public.cloud_providers_config
ADD COLUMN IF NOT EXISTS webhook_channel_id TEXT, -- ID channel Google Drive Push Notifications
ADD COLUMN IF NOT EXISTS webhook_resource_id TEXT, -- ID resource surveillée
ADD COLUMN IF NOT EXISTS webhook_expiration TIMESTAMP WITH TIME ZONE, -- Expiration webhook (7 jours)
ADD COLUMN IF NOT EXISTS webhook_address TEXT; -- URL webhook (pour renouvellement)

CREATE INDEX IF NOT EXISTS idx_cloud_providers_webhook_expiration ON public.cloud_providers_config(webhook_expiration) WHERE webhook_expiration IS NOT NULL;

-- =====================================================
-- 3. FONCTION NETTOYAGE SYNC LOGS (RÉTENTION 90 JOURS)
-- =====================================================

CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
  -- Supprimer logs synchronisation > 90 jours
  DELETE FROM public.sync_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. FONCTION EXPIRATION DOCUMENTS PENDING (30 JOURS)
-- =====================================================

CREATE OR REPLACE FUNCTION expire_pending_documents()
RETURNS void AS $$
BEGIN
  -- Marquer documents pending > 30 jours comme expirés
  UPDATE public.pending_documents
  SET
    status = 'expired',
    resolved_at = NOW(),
    updated_at = NOW()
  WHERE
    status = 'pending'
    AND created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. COMMENTAIRES
-- =====================================================

COMMENT ON TABLE public.sync_logs IS 'Logs synchronisation bidirectionnelle Google Drive → Plateforme';
COMMENT ON COLUMN public.sync_logs.sync_type IS 'Type synchronisation : webhook (Push Notification), polling (cron job), manual (lancée manuellement)';
COMMENT ON COLUMN public.sync_logs.sync_status IS 'Statut : started (en cours), success (réussie), partial (partielle avec erreurs), failed (échouée)';
COMMENT ON COLUMN public.sync_logs.duration_ms IS 'Durée synchronisation en millisecondes';
COMMENT ON COLUMN public.sync_logs.files_needs_classification IS 'Nombre fichiers détectés en zone tampon "Documents non classés/"';

COMMENT ON COLUMN public.cloud_providers_config.webhook_channel_id IS 'ID channel Google Drive Push Notifications (expire tous les 7 jours)';
COMMENT ON COLUMN public.cloud_providers_config.webhook_resource_id IS 'ID resource Google Drive surveillée (dossier racine "Clients Avocat/")';
COMMENT ON COLUMN public.cloud_providers_config.webhook_expiration IS 'Date expiration webhook (renouveler avant expiration)';
COMMENT ON COLUMN public.cloud_providers_config.webhook_address IS 'URL webhook configurée (https://domain.com/api/webhooks/google-drive)';

COMMENT ON FUNCTION cleanup_old_sync_logs IS 'Nettoie logs synchronisation > 90 jours (à appeler via cron quotidien)';
COMMENT ON FUNCTION expire_pending_documents IS 'Expire documents pending > 30 jours (à appeler via cron quotidien)';
