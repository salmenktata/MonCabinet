/**
 * Migration: Système d'Ingestion Web pour RAG
 * Date: 2026-02-08
 * Description: Créer les tables pour le crawling et l'indexation de sources web
 *              - web_sources: Configuration des sources web
 *              - web_pages: Pages crawlées
 *              - web_crawl_jobs: Queue de travail
 *              - web_crawl_logs: Historique des crawls
 */

-- ============================================================================
-- TABLE WEB_SOURCES - Configuration des sources web
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  name TEXT NOT NULL,
  base_url TEXT NOT NULL UNIQUE,
  description TEXT,
  favicon_url TEXT,

  -- Classification RAG
  category TEXT NOT NULL CHECK (category IN (
    'legislation', 'jurisprudence', 'doctrine', 'jort',
    'modeles', 'procedures', 'formulaires', 'autre'
  )),
  language TEXT DEFAULT 'fr' CHECK (language IN ('ar', 'fr', 'mixed')),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

  -- Configuration Crawl
  crawl_frequency INTERVAL NOT NULL DEFAULT '24 hours',
  adaptive_frequency BOOLEAN DEFAULT true,
  css_selectors JSONB DEFAULT '{}'::jsonb,
  url_patterns TEXT[] DEFAULT '{}',
  excluded_patterns TEXT[] DEFAULT '{}',
  max_depth INTEGER DEFAULT 3 CHECK (max_depth BETWEEN 1 AND 10),
  max_pages INTEGER DEFAULT 200 CHECK (max_pages BETWEEN 1 AND 10000),
  follow_links BOOLEAN DEFAULT true,
  download_files BOOLEAN DEFAULT true,

  -- Configuration Technique
  requires_javascript BOOLEAN DEFAULT false,
  user_agent TEXT DEFAULT 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
  rate_limit_ms INTEGER DEFAULT 1000 CHECK (rate_limit_ms BETWEEN 100 AND 60000),
  timeout_ms INTEGER DEFAULT 30000 CHECK (timeout_ms BETWEEN 5000 AND 120000),
  respect_robots_txt BOOLEAN DEFAULT true,
  custom_headers JSONB DEFAULT '{}'::jsonb,

  -- Sitemap & RSS
  sitemap_url TEXT,
  rss_feed_url TEXT,
  use_sitemap BOOLEAN DEFAULT false,

  -- État
  is_active BOOLEAN DEFAULT true,
  health_status TEXT DEFAULT 'unknown' CHECK (health_status IN (
    'healthy', 'degraded', 'failing', 'unknown'
  )),
  consecutive_failures INTEGER DEFAULT 0,

  -- Timestamps crawl
  last_crawl_at TIMESTAMPTZ,
  last_successful_crawl_at TIMESTAMPTZ,
  next_crawl_at TIMESTAMPTZ,

  -- Statistiques
  total_pages_discovered INTEGER DEFAULT 0,
  total_pages_indexed INTEGER DEFAULT 0,
  avg_pages_per_crawl FLOAT DEFAULT 0,
  avg_crawl_duration_ms INTEGER DEFAULT 0,

  -- Admin
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour scheduler
CREATE INDEX IF NOT EXISTS idx_web_sources_next_crawl
  ON web_sources(next_crawl_at)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_web_sources_health
  ON web_sources(health_status, is_active);

CREATE INDEX IF NOT EXISTS idx_web_sources_category
  ON web_sources(category);

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_web_sources_updated_at
  BEFORE UPDATE ON web_sources
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE WEB_PAGES - Pages crawlées
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_source_id UUID NOT NULL REFERENCES web_sources(id) ON DELETE CASCADE,

  -- Identification
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  canonical_url TEXT,

  -- Contenu
  title TEXT,
  content_hash TEXT,
  extracted_text TEXT,
  word_count INTEGER DEFAULT 0,
  language_detected TEXT,

  -- Métadonnées extraites
  meta_description TEXT,
  meta_author TEXT,
  meta_date TIMESTAMPTZ,
  meta_keywords TEXT[],
  structured_data JSONB,

  -- Fichiers liés
  linked_files JSONB DEFAULT '[]'::jsonb,

  -- HTTP Caching
  etag TEXT,
  last_modified TIMESTAMPTZ,

  -- État
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'crawled', 'indexed', 'failed',
    'unchanged', 'removed', 'blocked'
  )),
  error_message TEXT,
  error_count INTEGER DEFAULT 0,

  -- Intégration Knowledge Base
  knowledge_base_id UUID REFERENCES knowledge_base(id) ON DELETE SET NULL,
  is_indexed BOOLEAN DEFAULT false,
  chunks_count INTEGER DEFAULT 0,

  -- Tracking
  crawl_depth INTEGER DEFAULT 0,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_crawled_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  last_indexed_at TIMESTAMPTZ,

  -- Fraîcheur
  freshness_score FLOAT DEFAULT 1.0 CHECK (freshness_score BETWEEN 0 AND 1),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_source_url UNIQUE (web_source_id, url_hash)
);

-- Index optimisés
CREATE INDEX IF NOT EXISTS idx_web_pages_status
  ON web_pages(status);

CREATE INDEX IF NOT EXISTS idx_web_pages_source
  ON web_pages(web_source_id, last_crawled_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_pages_content_hash
  ON web_pages(content_hash);

CREATE INDEX IF NOT EXISTS idx_web_pages_freshness
  ON web_pages(freshness_score DESC)
  WHERE is_indexed = true;

CREATE INDEX IF NOT EXISTS idx_web_pages_kb_id
  ON web_pages(knowledge_base_id)
  WHERE knowledge_base_id IS NOT NULL;

-- Index fulltext
CREATE INDEX IF NOT EXISTS idx_web_pages_fts
  ON web_pages
  USING gin(to_tsvector('french', COALESCE(title,'') || ' ' || COALESCE(extracted_text,'')));

-- Trigger pour updated_at
CREATE OR REPLACE TRIGGER update_web_pages_updated_at
  BEFORE UPDATE ON web_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE WEB_CRAWL_JOBS - Queue de travail
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_source_id UUID NOT NULL REFERENCES web_sources(id) ON DELETE CASCADE,

  -- Type de job
  job_type TEXT NOT NULL CHECK (job_type IN (
    'full_crawl', 'incremental', 'single_page', 'reindex'
  )),

  -- État
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),

  -- Paramètres
  params JSONB DEFAULT '{}'::jsonb,

  -- Exécution
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  worker_id TEXT,

  -- Résultats
  pages_processed INTEGER DEFAULT 0,
  pages_new INTEGER DEFAULT 0,
  pages_changed INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  files_downloaded INTEGER DEFAULT 0,

  -- Erreurs
  errors JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_pending
  ON web_crawl_jobs(priority DESC, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_source
  ON web_crawl_jobs(web_source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status
  ON web_crawl_jobs(status);

-- ============================================================================
-- TABLE WEB_CRAWL_LOGS - Historique détaillé
-- ============================================================================

CREATE TABLE IF NOT EXISTS web_crawl_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  web_source_id UUID NOT NULL REFERENCES web_sources(id) ON DELETE CASCADE,
  job_id UUID REFERENCES web_crawl_jobs(id) ON DELETE SET NULL,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Statistiques
  pages_crawled INTEGER DEFAULT 0,
  pages_new INTEGER DEFAULT 0,
  pages_changed INTEGER DEFAULT 0,
  pages_unchanged INTEGER DEFAULT 0,
  pages_failed INTEGER DEFAULT 0,
  pages_skipped INTEGER DEFAULT 0,
  files_downloaded INTEGER DEFAULT 0,
  bytes_downloaded BIGINT DEFAULT 0,

  -- Indexation
  chunks_created INTEGER DEFAULT 0,
  embeddings_generated INTEGER DEFAULT 0,

  -- Résultat
  status TEXT DEFAULT 'running' CHECK (status IN (
    'running', 'completed', 'failed', 'cancelled'
  )),
  error_message TEXT,

  -- Détails erreurs
  errors JSONB DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_source
  ON web_crawl_logs(web_source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_crawl_logs_job
  ON web_crawl_logs(job_id)
  WHERE job_id IS NOT NULL;

-- ============================================================================
-- FONCTIONS UTILITAIRES
-- ============================================================================

/**
 * Réclamer le prochain job de crawl en attente
 */
CREATE OR REPLACE FUNCTION claim_next_crawl_job(p_worker_id TEXT DEFAULT NULL)
RETURNS TABLE (
  job_id UUID,
  web_source_id UUID,
  job_type TEXT,
  params JSONB,
  source_name TEXT,
  base_url TEXT,
  category TEXT,
  requires_javascript BOOLEAN,
  css_selectors JSONB,
  max_depth INTEGER,
  max_pages INTEGER,
  rate_limit_ms INTEGER,
  timeout_ms INTEGER,
  respect_robots_txt BOOLEAN,
  user_agent TEXT,
  custom_headers JSONB
) AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Sélectionner et verrouiller le prochain job
  SELECT j.id INTO v_job_id
  FROM web_crawl_jobs j
  WHERE j.status = 'pending'
  ORDER BY j.priority DESC, j.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Marquer comme running
  UPDATE web_crawl_jobs
  SET status = 'running',
      started_at = NOW(),
      worker_id = p_worker_id
  WHERE id = v_job_id;

  -- Retourner les infos du job avec la config de la source
  RETURN QUERY
  SELECT
    j.id as job_id,
    j.web_source_id,
    j.job_type,
    j.params,
    s.name as source_name,
    s.base_url,
    s.category,
    s.requires_javascript,
    s.css_selectors,
    s.max_depth,
    s.max_pages,
    s.rate_limit_ms,
    s.timeout_ms,
    s.respect_robots_txt,
    s.user_agent,
    s.custom_headers
  FROM web_crawl_jobs j
  JOIN web_sources s ON j.web_source_id = s.id
  WHERE j.id = v_job_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Compléter un job de crawl
 */
CREATE OR REPLACE FUNCTION complete_crawl_job(
  p_job_id UUID,
  p_success BOOLEAN,
  p_pages_processed INTEGER DEFAULT 0,
  p_pages_new INTEGER DEFAULT 0,
  p_pages_changed INTEGER DEFAULT 0,
  p_pages_failed INTEGER DEFAULT 0,
  p_files_downloaded INTEGER DEFAULT 0,
  p_error_message TEXT DEFAULT NULL,
  p_errors JSONB DEFAULT '[]'::jsonb
)
RETURNS VOID AS $$
DECLARE
  v_source_id UUID;
  v_started_at TIMESTAMPTZ;
  v_duration_ms INTEGER;
BEGIN
  -- Récupérer les infos du job
  SELECT web_source_id, started_at
  INTO v_source_id, v_started_at
  FROM web_crawl_jobs
  WHERE id = p_job_id;

  -- Calculer la durée
  v_duration_ms := EXTRACT(EPOCH FROM (NOW() - v_started_at)) * 1000;

  -- Mettre à jour le job
  UPDATE web_crawl_jobs
  SET status = CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      completed_at = NOW(),
      pages_processed = p_pages_processed,
      pages_new = p_pages_new,
      pages_changed = p_pages_changed,
      pages_failed = p_pages_failed,
      files_downloaded = p_files_downloaded,
      error_message = p_error_message,
      errors = p_errors
  WHERE id = p_job_id;

  -- Mettre à jour la source
  UPDATE web_sources
  SET last_crawl_at = NOW(),
      last_successful_crawl_at = CASE WHEN p_success THEN NOW() ELSE last_successful_crawl_at END,
      next_crawl_at = NOW() + crawl_frequency,
      consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
      health_status = CASE
        WHEN p_success THEN 'healthy'
        WHEN consecutive_failures >= 3 THEN 'failing'
        ELSE 'degraded'
      END,
      total_pages_discovered = total_pages_discovered + p_pages_new,
      total_pages_indexed = total_pages_indexed + p_pages_changed + p_pages_new - p_pages_failed,
      avg_crawl_duration_ms = CASE
        WHEN avg_crawl_duration_ms = 0 THEN v_duration_ms
        ELSE (avg_crawl_duration_ms + v_duration_ms) / 2
      END,
      avg_pages_per_crawl = CASE
        WHEN avg_pages_per_crawl = 0 THEN p_pages_processed
        ELSE (avg_pages_per_crawl + p_pages_processed) / 2
      END
  WHERE id = v_source_id;

  -- Créer une entrée de log
  INSERT INTO web_crawl_logs (
    web_source_id, job_id, started_at, completed_at, duration_ms,
    pages_crawled, pages_new, pages_changed, pages_failed,
    files_downloaded, status, error_message, errors
  ) VALUES (
    v_source_id, p_job_id, v_started_at, NOW(), v_duration_ms,
    p_pages_processed, p_pages_new, p_pages_changed, p_pages_failed,
    p_files_downloaded,
    CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
    p_error_message, p_errors
  );
END;
$$ LANGUAGE plpgsql;

/**
 * Créer un job de crawl pour une source
 */
CREATE OR REPLACE FUNCTION create_crawl_job(
  p_source_id UUID,
  p_job_type TEXT DEFAULT 'incremental',
  p_priority INTEGER DEFAULT 5,
  p_params JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Vérifier qu'il n'y a pas déjà un job en cours pour cette source
  IF EXISTS (
    SELECT 1 FROM web_crawl_jobs
    WHERE web_source_id = p_source_id
    AND status IN ('pending', 'running')
  ) THEN
    RAISE EXCEPTION 'Un job est déjà en cours pour cette source';
  END IF;

  INSERT INTO web_crawl_jobs (web_source_id, job_type, priority, params)
  VALUES (p_source_id, p_job_type, p_priority, p_params)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql;

/**
 * Récupérer les sources à crawler
 */
CREATE OR REPLACE FUNCTION get_sources_to_crawl(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  id UUID,
  name TEXT,
  base_url TEXT,
  category TEXT,
  priority INTEGER,
  last_crawl_at TIMESTAMPTZ,
  next_crawl_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.name, s.base_url, s.category, s.priority,
    s.last_crawl_at, s.next_crawl_at
  FROM web_sources s
  WHERE s.is_active = true
    AND s.health_status != 'failing'
    AND (s.next_crawl_at IS NULL OR s.next_crawl_at <= NOW())
    AND NOT EXISTS (
      SELECT 1 FROM web_crawl_jobs j
      WHERE j.web_source_id = s.id
      AND j.status IN ('pending', 'running')
    )
  ORDER BY s.priority DESC, s.next_crawl_at ASC NULLS FIRST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

/**
 * Statistiques globales des sources web
 */
CREATE OR REPLACE FUNCTION get_web_sources_stats()
RETURNS TABLE (
  total_sources BIGINT,
  active_sources BIGINT,
  healthy_sources BIGINT,
  failing_sources BIGINT,
  total_pages BIGINT,
  indexed_pages BIGINT,
  pending_jobs BIGINT,
  running_jobs BIGINT,
  by_category JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM web_sources)::BIGINT as total_sources,
    (SELECT COUNT(*) FROM web_sources WHERE is_active = true)::BIGINT as active_sources,
    (SELECT COUNT(*) FROM web_sources WHERE health_status = 'healthy')::BIGINT as healthy_sources,
    (SELECT COUNT(*) FROM web_sources WHERE health_status = 'failing')::BIGINT as failing_sources,
    (SELECT COUNT(*) FROM web_pages)::BIGINT as total_pages,
    (SELECT COUNT(*) FROM web_pages WHERE is_indexed = true)::BIGINT as indexed_pages,
    (SELECT COUNT(*) FROM web_crawl_jobs WHERE status = 'pending')::BIGINT as pending_jobs,
    (SELECT COUNT(*) FROM web_crawl_jobs WHERE status = 'running')::BIGINT as running_jobs,
    (
      SELECT COALESCE(jsonb_object_agg(category, cnt), '{}'::jsonb)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM web_sources
        WHERE is_active = true
        GROUP BY category
      ) sub
    ) as by_category;
END;
$$ LANGUAGE plpgsql;

/**
 * Mettre à jour le score de fraîcheur des pages
 * À appeler périodiquement (cron quotidien)
 */
CREATE OR REPLACE FUNCTION update_pages_freshness()
RETURNS INTEGER AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH updated AS (
    UPDATE web_pages
    SET freshness_score = GREATEST(0, 1 - (
      EXTRACT(EPOCH FROM (NOW() - COALESCE(last_crawled_at, created_at))) /
      (30 * 24 * 3600)  -- Décroissance sur 30 jours
    ))
    WHERE is_indexed = true
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM updated;

  RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VÉRIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Migration Web Sources terminée avec succès!';
  RAISE NOTICE '===============================================';
  RAISE NOTICE 'Tables créées:';
  RAISE NOTICE '  - web_sources: Configuration des sources web';
  RAISE NOTICE '  - web_pages: Pages crawlées';
  RAISE NOTICE '  - web_crawl_jobs: Queue de travail';
  RAISE NOTICE '  - web_crawl_logs: Historique des crawls';
  RAISE NOTICE '';
  RAISE NOTICE 'Fonctions créées:';
  RAISE NOTICE '  - claim_next_crawl_job()';
  RAISE NOTICE '  - complete_crawl_job()';
  RAISE NOTICE '  - create_crawl_job()';
  RAISE NOTICE '  - get_sources_to_crawl()';
  RAISE NOTICE '  - get_web_sources_stats()';
  RAISE NOTICE '  - update_pages_freshness()';
  RAISE NOTICE '===============================================';
END $$;
