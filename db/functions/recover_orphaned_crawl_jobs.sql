-- Fonction pour récupérer les jobs de crawl orphelins
-- Jobs considérés orphelins : status='running' depuis plus de 15 minutes sans progression
--
-- Usage:
--   SELECT * FROM recover_orphaned_crawl_jobs();
--
-- Cette fonction doit être appelée périodiquement (ex: par le cron web-crawler)

CREATE OR REPLACE FUNCTION recover_orphaned_crawl_jobs()
RETURNS TABLE (
  job_id uuid,
  web_source_id uuid,
  job_type text,
  worker_id text,
  stuck_duration interval,
  action_taken text
)
LANGUAGE plpgsql
AS $$
DECLARE
  recovered_count integer := 0;
  ttl_minutes integer := 15; -- Timeout après 15 minutes
BEGIN
  -- Identifier et récupérer les jobs bloqués
  FOR job_id, web_source_id, job_type, worker_id, stuck_duration IN
    SELECT
      j.id,
      j.web_source_id,
      j.job_type,
      j.worker_id,
      NOW() - j.started_at as duration
    FROM web_crawl_jobs j
    WHERE j.status = 'running'
      AND j.started_at IS NOT NULL
      AND NOW() - j.started_at > INTERVAL '1 minute' * ttl_minutes
  LOOP
    -- Marquer le job comme échoué
    UPDATE web_crawl_jobs
    SET
      status = 'failed',
      completed_at = NOW(),
      error_message = format(
        'Job orphelin récupéré automatiquement après %s minutes de blocage (TTL: %s min)',
        EXTRACT(EPOCH FROM stuck_duration) / 60,
        ttl_minutes
      )
    WHERE id = job_id;

    recovered_count := recovered_count + 1;
    action_taken := format('Job marqué comme échoué après %s', stuck_duration);

    -- Retourner les détails du job récupéré
    RETURN NEXT;
  END LOOP;

  -- Logger le résultat dans une table dédiée si elle existe
  BEGIN
    INSERT INTO system_logs (level, category, message, metadata, created_at)
    VALUES (
      'warning',
      'crawler',
      format('Récupération automatique de %s job(s) orphelin(s)', recovered_count),
      jsonb_build_object(
        'recovered_count', recovered_count,
        'ttl_minutes', ttl_minutes,
        'function', 'recover_orphaned_crawl_jobs'
      ),
      NOW()
    );
  EXCEPTION WHEN undefined_table THEN
    -- Table system_logs n'existe pas, ignorer
    NULL;
  END;

  RETURN;
END;
$$;

-- Commentaire de la fonction
COMMENT ON FUNCTION recover_orphaned_crawl_jobs() IS
'Récupère automatiquement les jobs de crawl bloqués en status running depuis plus de 15 minutes. Doit être appelée périodiquement par le cron.';
