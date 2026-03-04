-- Migration: Ajouter les 3 crons eval manquants au dashboard monitoring
-- Date: 2026-03-04
-- Description: gap-analysis, silver-generation, log-cleanup existent sur VPS et ont leurs routes
--   API mais ne sont pas enregistrés dans cron_schedules → invisibles sur le dashboard

INSERT INTO cron_schedules (cron_name, display_name, description, cron_expression, timeout_ms, alert_on_failure, is_active)
VALUES
  (
    'gap-analysis',
    'Gap Analysis KB',
    'Détecte les lacunes de la base de connaissances (abstentions ≥10 ou sim<0.20) et génère des alertes de priorité high/medium/low',
    '0 10 * * 1',
    60000,
    true,
    true
  ),
  (
    'silver-generation',
    'Génération Silver Dataset',
    'Génère des questions silver depuis le trafic prod (feedback+ + sim≥0.50) via LLM pour enrichir le gold dataset d''évaluation RAG',
    '0 11 * * 1',
    120000,
    false,
    true
  ),
  (
    'log-cleanup',
    'Nettoyage Logs RAG',
    'Purge les entrées rag_query_log de plus de 90 jours pour limiter la croissance de la table (TTL 90j)',
    '0 2 1 * *',
    60000,
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
