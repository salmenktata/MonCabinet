-- Migration: Ajouter les crons VPS manquants au dashboard monitoring
-- Date: 2026-02-27
-- Description: Enregistre les 8 crons présents sur VPS mais absents de cron_schedules
--   + watchdog-vps déjà en DB mais non déclenché via UI

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
VALUES
  (
    'web-crawler',
    'Crawl Sources Web',
    'Crawl des sources web autorisées (9anoun.tn, cassation.tn, iort.gov.tn) — déclenche crawling incrémental des nouvelles pages',
    '0 */2 * * *',
    1800000,
    true,
    true
  ),
  (
    'crawl-iort',
    'Crawl JORT Officiel',
    'Crawl du Journal Officiel de la République Tunisienne (iort.gov.tn) — nouvelles publications et PDFs',
    '0 6 * * *',
    600000,
    true,
    true
  ),
  (
    'monitor-rag',
    'Monitoring RAG Quotidien',
    'Monitoring quotidien de la qualité RAG : taux d''abstention, hallucinations détectées, sources citées',
    '0 7 * * *',
    120000,
    true,
    true
  ),
  (
    'extract-metadata-cassation',
    'Extraction Métadonnées Cassation',
    'Extrait et structure les métadonnées des arrêts de la Cour de Cassation tunisienne (thème, chambre, date)',
    '30 7 * * *',
    300000,
    true,
    true
  ),
  (
    'expire-trials',
    'Expiration Périodes d''Essai',
    'Expire automatiquement les périodes d''essai dépassées et notifie les utilisateurs concernés',
    '0 2 * * *',
    60000,
    true,
    true
  ),
  (
    'trial-onboarding',
    'Onboarding Utilisateurs Essai',
    'Envoie les emails d''onboarding aux nouveaux utilisateurs en période d''essai (j+1, j+3, j+7)',
    '0 9 * * *',
    60000,
    true,
    true
  ),
  (
    'check-renewals',
    'Vérification Renouvellements',
    'Vérifie les abonnements arrivant à échéance et envoie les rappels de renouvellement',
    '0 8 * * *',
    60000,
    true,
    true
  ),
  (
    'docker-cleanup',
    'Nettoyage Docker Hebdomadaire',
    'Nettoyage hebdomadaire : images dangling, build cache (garde 2GB), logs tronqués, cache Next.js >300MB, /tmp >7j',
    '0 2 * * 0',
    300000,
    false,
    true
  )
ON CONFLICT (cron_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  cron_expression = EXCLUDED.cron_expression,
  timeout_ms = EXCLUDED.timeout_ms,
  alert_on_failure = EXCLUDED.alert_on_failure,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- S'assurer que watchdog-vps a bien le bon script dans la description
UPDATE cron_schedules SET
  description = 'Surveille santé Docker/RAM/CPU toutes les 5min et redémarre le container si seuils dépassés',
  cron_expression = '*/5 * * * *',
  timeout_ms = 15000,
  is_active = true,
  updated_at = NOW()
WHERE cron_name = 'watchdog-vps';
