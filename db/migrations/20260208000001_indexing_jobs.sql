/**
 * Migration: Table queue d'indexation asynchrone
 * Date: 2026-02-08
 * Description: Système de queue pour l'indexation async des documents KB
 */

-- ============================================================================
-- TABLE INDEXING_JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS indexing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('document', 'knowledge_base', 'reindex')),
  target_id UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INT DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Index pour récupérer les jobs à traiter
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_pending
  ON indexing_jobs(status, priority DESC, created_at ASC)
  WHERE status = 'pending';

-- Index pour éviter les doublons
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_target
  ON indexing_jobs(target_id, job_type)
  WHERE status IN ('pending', 'processing');

-- Index pour le cleanup
CREATE INDEX IF NOT EXISTS idx_indexing_jobs_completed
  ON indexing_jobs(completed_at)
  WHERE status IN ('completed', 'failed');

-- ============================================================================
-- FONCTIONS
-- ============================================================================

/**
 * Ajoute un job à la queue (évite les doublons)
 */
CREATE OR REPLACE FUNCTION add_indexing_job(
  p_job_type TEXT,
  p_target_id UUID,
  p_priority INT DEFAULT 5,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
  v_existing_id UUID;
BEGIN
  -- Vérifier s'il existe déjà un job pending/processing pour cette cible
  SELECT id INTO v_existing_id
  FROM indexing_jobs
  WHERE target_id = p_target_id
    AND job_type = p_job_type
    AND status IN ('pending', 'processing')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Retourner l'ID existant
    RETURN v_existing_id;
  END IF;

  -- Créer un nouveau job
  INSERT INTO indexing_jobs (job_type, target_id, priority, metadata)
  VALUES (p_job_type, p_target_id, p_priority, p_metadata)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Récupère le prochain job à traiter (avec lock)
 */
CREATE OR REPLACE FUNCTION claim_next_indexing_job()
RETURNS TABLE (
  id UUID,
  job_type TEXT,
  target_id UUID,
  priority INT,
  attempts INT,
  metadata JSONB
) AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Sélectionner et verrouiller le prochain job
  SELECT ij.id INTO v_job_id
  FROM indexing_jobs ij
  WHERE ij.status = 'pending'
    AND ij.attempts < ij.max_attempts
  ORDER BY ij.priority DESC, ij.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme en cours de traitement
  UPDATE indexing_jobs
  SET status = 'processing',
      started_at = NOW(),
      attempts = indexing_jobs.attempts + 1
  WHERE indexing_jobs.id = v_job_id;

  -- Retourner les détails du job
  RETURN QUERY
  SELECT ij.id, ij.job_type, ij.target_id, ij.priority, ij.attempts, ij.metadata
  FROM indexing_jobs ij
  WHERE ij.id = v_job_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Marque un job comme terminé
 */
CREATE OR REPLACE FUNCTION complete_indexing_job(
  p_job_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE indexing_jobs
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      completed_at = NOW(),
      error_message = p_error_message
  WHERE id = p_job_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

/**
 * Récupère les statistiques de la queue
 */
CREATE OR REPLACE FUNCTION get_indexing_queue_stats()
RETURNS TABLE (
  pending_count BIGINT,
  processing_count BIGINT,
  completed_today BIGINT,
  failed_today BIGINT,
  avg_processing_time_ms NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'pending') as pending_count,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'processing') as processing_count,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'completed' AND completed_at >= CURRENT_DATE) as completed_today,
    (SELECT COUNT(*) FROM indexing_jobs WHERE status = 'failed' AND completed_at >= CURRENT_DATE) as failed_today,
    (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000), 2)
     FROM indexing_jobs
     WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
     AND completed_at >= CURRENT_DATE) as avg_processing_time_ms;
END;
$$ LANGUAGE plpgsql;

/**
 * Nettoie les vieux jobs terminés (garde 7 jours)
 */
CREATE OR REPLACE FUNCTION cleanup_old_indexing_jobs()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM indexing_jobs
  WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

/**
 * Récupère les jobs orphelins (bloqués en 'processing' depuis trop longtemps)
 * TTL configurable via INDEXING_JOB_TTL_MINUTES (défaut: 15 minutes)
 */
CREATE OR REPLACE FUNCTION recover_orphaned_indexing_jobs()
RETURNS INTEGER AS $$
DECLARE
  v_recovered INTEGER;
  v_ttl_minutes INTEGER;
BEGIN
  -- Récupérer le TTL depuis les variables d'environnement (défaut: 15 minutes)
  v_ttl_minutes := COALESCE(
    (SELECT NULLIF(current_setting('app.indexing_job_ttl_minutes', true), '')::INTEGER),
    15
  );

  -- Réinitialiser les jobs orphelins (plus de v_ttl_minutes en processing)
  UPDATE indexing_jobs
  SET status = 'pending',
      started_at = NULL
  WHERE status = 'processing'
    AND started_at < NOW() - (v_ttl_minutes || ' minutes')::INTERVAL
    AND attempts < max_attempts;

  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  IF v_recovered > 0 THEN
    RAISE NOTICE '[Recovery] % jobs orphelins récupérés (TTL: % minutes)', v_recovered, v_ttl_minutes;
  END IF;

  RETURN v_recovered;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Table indexing_jobs créée avec succès!';
  RAISE NOTICE '📋 Fonctions: add_indexing_job, claim_next_indexing_job, complete_indexing_job';
  RAISE NOTICE '📋 Fonctions: get_indexing_queue_stats, cleanup_old_indexing_jobs, recover_orphaned_indexing_jobs';
END $$;
