-- Migration: Tables Sync Logs et Webhook Channels
-- Date: 2026-02-05
-- Description: Tracking synchronisation et expiration webhooks

-- Table sync_logs : Historique synchronisations Google Drive
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider et type
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  sync_type TEXT NOT NULL CHECK (sync_type IN ('webhook', 'scheduled', 'manual')),
  
  -- Statut et timing
  sync_status TEXT NOT NULL CHECK (sync_status IN ('started', 'success', 'partial', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Statistiques fichiers
  files_scanned INTEGER DEFAULT 0,
  files_added INTEGER DEFAULT 0,
  files_updated INTEGER DEFAULT 0,
  files_deleted INTEGER DEFAULT 0,
  files_needs_classification INTEGER DEFAULT 0,
  
  -- Erreurs
  error_message TEXT,
  error_details JSONB,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour performances
CREATE INDEX idx_sync_logs_user_id ON sync_logs(user_id);
CREATE INDEX idx_sync_logs_started_at ON sync_logs(started_at DESC);
CREATE INDEX idx_sync_logs_status ON sync_logs(sync_status);
CREATE INDEX idx_sync_logs_provider ON sync_logs(provider);

-- Commentaires
COMMENT ON TABLE sync_logs IS 'Historique des synchronisations Google Drive vers base de données';
COMMENT ON COLUMN sync_logs.sync_type IS 'Type déclenchement: webhook (push notification), scheduled (cron), manual (utilisateur)';
COMMENT ON COLUMN sync_logs.sync_status IS 'Statut: started (en cours), success (succès), partial (succès partiel), failed (échec)';
COMMENT ON COLUMN sync_logs.files_needs_classification IS 'Nombre de fichiers ajoutés dans "Documents non classés" en attente de classification';

-- RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateur voit ses propres logs
CREATE POLICY "Users can view own sync logs"
ON sync_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System peut créer logs (via service)
CREATE POLICY "System can create sync logs"
ON sync_logs
FOR INSERT
WITH CHECK (true);

-- Policy: System peut mettre à jour logs
CREATE POLICY "System can update sync logs"
ON sync_logs
FOR UPDATE
USING (true);

---

-- Table webhook_channels : Tracking webhooks Google Drive (expiration)
CREATE TABLE IF NOT EXISTS webhook_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Provider
  provider TEXT NOT NULL CHECK (provider IN ('google_drive')),
  
  -- Identifiants webhook Google
  channel_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  
  -- Ressource surveillée
  folder_id TEXT NOT NULL,
  folder_name TEXT,
  
  -- Expiration (webhooks Google expirent après 7 jours max)
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  renewed_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  
  -- Contrainte unique
  UNIQUE(user_id, provider, channel_id)
);

-- Index
CREATE INDEX idx_webhook_channels_user_id ON webhook_channels(user_id);
CREATE INDEX idx_webhook_channels_expires_at ON webhook_channels(expires_at);
CREATE INDEX idx_webhook_channels_channel_id ON webhook_channels(channel_id);
CREATE INDEX idx_webhook_channels_active ON webhook_channels(user_id, provider) WHERE stopped_at IS NULL;

-- Commentaires
COMMENT ON TABLE webhook_channels IS 'Tracking des webhooks Google Drive pour renouvellement automatique avant expiration';
COMMENT ON COLUMN webhook_channels.expires_at IS 'Date expiration webhook (Google max 7 jours). Renouveler avant cette date.';
COMMENT ON COLUMN webhook_channels.renewed_at IS 'Date dernier renouvellement. NULL si jamais renouvelé.';
COMMENT ON COLUMN webhook_channels.stopped_at IS 'Date arrêt manuel du webhook. NULL si actif.';

-- RLS
ALTER TABLE webhook_channels ENABLE ROW LEVEL SECURITY;

-- Policy: Utilisateur voit ses propres webhooks
CREATE POLICY "Users can view own webhook channels"
ON webhook_channels
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: System peut gérer webhooks
CREATE POLICY "System can manage webhook channels"
ON webhook_channels
FOR ALL
USING (true)
WITH CHECK (true);

---

-- Vue : Webhooks nécessitant renouvellement (expirent dans moins de 24h)
CREATE OR REPLACE VIEW webhook_channels_expiring_soon AS
SELECT 
  wc.*,
  EXTRACT(EPOCH FROM (wc.expires_at - now())) / 3600 AS hours_until_expiration,
  cp.access_token IS NOT NULL AS has_valid_config
FROM webhook_channels wc
LEFT JOIN cloud_providers_config cp ON wc.user_id = cp.user_id AND wc.provider = cp.provider
WHERE wc.stopped_at IS NULL
  AND wc.expires_at < (now() + INTERVAL '24 hours')
ORDER BY wc.expires_at ASC;

COMMENT ON VIEW webhook_channels_expiring_soon IS 'Webhooks expirant dans moins de 24h nécessitant renouvellement';

---

-- Vue : Statistiques synchronisation par utilisateur (30 derniers jours)
CREATE OR REPLACE VIEW sync_stats_30d AS
SELECT 
  user_id,
  provider,
  COUNT(*) AS total_syncs,
  COUNT(CASE WHEN sync_status = 'success' THEN 1 END) AS successful_syncs,
  COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) AS failed_syncs,
  COUNT(CASE WHEN sync_status = 'partial' THEN 1 END) AS partial_syncs,
  SUM(files_scanned) AS total_files_scanned,
  SUM(files_added) AS total_files_added,
  SUM(files_updated) AS total_files_updated,
  SUM(files_needs_classification) AS total_files_pending,
  AVG(duration_ms) AS avg_duration_ms,
  MAX(started_at) AS last_sync_at
FROM sync_logs
WHERE started_at > (now() - INTERVAL '30 days')
GROUP BY user_id, provider;

COMMENT ON VIEW sync_stats_30d IS 'Statistiques synchronisation par utilisateur sur 30 derniers jours';

---

-- Fonction : Nettoyer vieux logs (garder 90 jours)
CREATE OR REPLACE FUNCTION cleanup_old_sync_logs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sync_logs
  WHERE started_at < (now() - INTERVAL '90 days')
  RETURNING id INTO deleted_count;
  
  RETURN COALESCE(deleted_count, 0);
END;
$$;

COMMENT ON FUNCTION cleanup_old_sync_logs IS 'Supprime les sync_logs de plus de 90 jours. Retourne nombre supprimé.';

---

-- Instructions
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables sync_logs et webhook_channels créées !';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables ajoutées :';
  RAISE NOTICE '  - sync_logs : Historique synchronisations';
  RAISE NOTICE '  - webhook_channels : Tracking webhooks + expiration';
  RAISE NOTICE '';
  RAISE NOTICE 'Vues ajoutées :';
  RAISE NOTICE '  - webhook_channels_expiring_soon : Webhooks à renouveler (< 24h)';
  RAISE NOTICE '  - sync_stats_30d : Stats synchro 30 jours';
  RAISE NOTICE '';
  RAISE NOTICE 'Fonction ajoutée :';
  RAISE NOTICE '  - cleanup_old_sync_logs() : Nettoie logs > 90 jours';
  RAISE NOTICE '';
  RAISE NOTICE 'Configuration Cron recommandée :';
  RAISE NOTICE '  - Renouveler webhooks : tous les jours (check expiration < 24h)';
  RAISE NOTICE '  - Nettoyer logs : toutes les semaines';
  RAISE NOTICE '';
  RAISE NOTICE 'Requêtes utiles :';
  RAISE NOTICE '  SELECT * FROM webhook_channels_expiring_soon;';
  RAISE NOTICE '  SELECT * FROM sync_stats_30d WHERE user_id = ''xxx'';';
  RAISE NOTICE '  SELECT cleanup_old_sync_logs();';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
