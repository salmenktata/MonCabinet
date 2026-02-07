-- Migration: Configuration Cron Job Notifications Quotidiennes
-- Date: 2026-02-05
-- Description: Configure pg_cron pour envoyer notifications email à 6h00 (Tunisie)

-- Activer les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fonction helper pour appeler l'Edge Function
CREATE OR REPLACE FUNCTION trigger_daily_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_id bigint;
  cron_secret text;
  function_url text;
BEGIN
  -- Récupérer les variables depuis secrets Supabase
  cron_secret := current_setting('app.settings.cron_secret', true);
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-notifications';
  
  -- Si pas configuré, utiliser valeurs par défaut
  IF cron_secret IS NULL THEN
    cron_secret := 'change-me-in-production';
  END IF;
  
  IF function_url IS NULL OR function_url = '/functions/v1/send-notifications' THEN
    function_url := 'https://vgaofkucdpydyblrykbh.supabase.co/functions/v1/send-notifications';
  END IF;

  -- Appeler l'Edge Function via pg_net
  SELECT net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := '{}'::jsonb
  ) INTO response_id;

  -- Logger le résultat
  RAISE NOTICE 'Notifications déclenchées, request_id: %', response_id;
END;
$$;

COMMENT ON FUNCTION trigger_daily_notifications IS 'Fonction pour déclencher les notifications quotidiennes via Edge Function';

-- Supprimer le job existant s'il existe
SELECT cron.unschedule('daily-notifications-6am')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'daily-notifications-6am'
);

-- Créer le job Cron : Tous les jours à 6h00 (heure Tunisie)
-- Note: Tunisie est UTC+1 en hiver, donc 05:00 UTC
-- En été (avril-octobre), ajuster manuellement à 04:00 UTC si nécessaire
SELECT cron.schedule(
  'daily-notifications-6am',           -- Nom du job
  '0 5 * * *',                          -- Cron expression: 05:00 UTC = 06:00 Tunisie (hiver)
  'SELECT trigger_daily_notifications();'
);

-- Créer une vue pour monitorer les exécutions du Cron
CREATE OR REPLACE VIEW cron_job_status AS
SELECT 
  j.jobid,
  j.jobname,
  j.schedule,
  j.active,
  r.runid,
  r.job_pid,
  r.start_time,
  r.end_time,
  r.status,
  r.return_message,
  EXTRACT(EPOCH FROM (r.end_time - r.start_time)) as duration_seconds
FROM cron.job j
LEFT JOIN cron.job_run_details r ON j.jobid = r.jobid
WHERE j.jobname = 'daily-notifications-6am'
ORDER BY r.start_time DESC
LIMIT 30;

COMMENT ON VIEW cron_job_status IS 'Vue pour monitorer les exécutions du job de notifications quotidiennes';

-- Accorder les permissions nécessaires
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Instructions de configuration
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Configuration Cron Notifications terminée !';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Job créé : daily-notifications-6am';
  RAISE NOTICE 'Horaire   : 05:00 UTC (06:00 Tunisie en hiver)';
  RAISE NOTICE 'Fréquence : Quotidien';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  IMPORTANT : Configurer les secrets Supabase :';
  RAISE NOTICE '';
  RAISE NOTICE '1. Dans Dashboard Supabase > Project Settings > Vault:';
  RAISE NOTICE '   - app.settings.cron_secret = <votre-secret>';
  RAISE NOTICE '   - app.settings.supabase_url = https://vgaofkucdpydyblrykbh.supabase.co';
  RAISE NOTICE '';
  RAISE NOTICE '2. Générer un secret sécurisé :';
  RAISE NOTICE '   openssl rand -base64 32';
  RAISE NOTICE '';
  RAISE NOTICE '3. Configurer dans Edge Function (CRON_SECRET):';
  RAISE NOTICE '   supabase secrets set CRON_SECRET=<votre-secret>';
  RAISE NOTICE '';
  RAISE NOTICE 'Monitorer les exécutions :';
  RAISE NOTICE '   SELECT * FROM cron_job_status;';
  RAISE NOTICE '';
  RAISE NOTICE 'Désactiver temporairement :';
  RAISE NOTICE '   SELECT cron.unschedule(''daily-notifications-6am'');';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
