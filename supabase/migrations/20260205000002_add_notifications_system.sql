-- Migration: Système de notifications quotidiennes
-- Date: 2026-02-05
-- Description: Ajoute table logs notifications et préférences utilisateur

-- Table notification_logs pour logger les envois
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('daily_digest', 'echeance_alert', 'action_alert', 'audience_reminder', 'facture_reminder')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  email_id TEXT, -- ID Resend
  error_message TEXT,
  data JSONB, -- Données additionnelles (counts, etc.)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour logs
CREATE INDEX idx_notification_logs_user_id ON notification_logs(user_id);
CREATE INDEX idx_notification_logs_created_at ON notification_logs(created_at DESC);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);

-- Commentaires
COMMENT ON TABLE notification_logs IS 'Logs des envois de notifications email';
COMMENT ON COLUMN notification_logs.type IS 'Type de notification envoyée';
COMMENT ON COLUMN notification_logs.status IS 'Statut envoi (success, error, skipped)';
COMMENT ON COLUMN notification_logs.email_id IS 'ID email Resend pour traçabilité';
COMMENT ON COLUMN notification_logs.data IS 'Données additionnelles (counts, metadata)';

-- Ajouter colonne notification_preferences à profiles (JSONB pour flexibilité)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
  "enabled": true,
  "send_time": "06:00",
  "notify_echeances": {"j15": true, "j7": true, "j3": true, "j1": true},
  "notify_actions_urgentes": true,
  "notify_audiences": true,
  "notify_factures_impayees": true,
  "factures_seuil_jours": 30,
  "langue_email": "fr",
  "format_email": "html"
}'::jsonb;

-- Commentaire
COMMENT ON COLUMN profiles.notification_preferences IS 'Préférences notifications utilisateur (JSON)';

-- RLS policies pour notification_logs
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les utilisateurs peuvent voir leurs propres logs"
  ON notification_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Fonction pour nettoyer vieux logs (>90 jours)
CREATE OR REPLACE FUNCTION clean_old_notification_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM notification_logs
  WHERE created_at < now() - INTERVAL '90 days';
END;
$$;

COMMENT ON FUNCTION clean_old_notification_logs() IS 'Supprime les logs de notifications de plus de 90 jours';

-- Note: Pour configurer pg_cron, exécuter depuis Supabase Dashboard SQL Editor:
-- SELECT cron.schedule(
--   'daily-notifications',
--   '0 6 * * *', -- 6h00 quotidien
--   $$
--   SELECT net.http_post(
--     url := 'https://<project-ref>.supabase.co/functions/v1/send-notifications',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon-key>"}'::jsonb,
--     body := '{}'::jsonb
--   ) as request_id;
--   $$
-- );
