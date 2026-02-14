-- Migration: RediSearch Setup - Tracking & Monitoring
-- Date: 2026-02-14
-- Objectif: Préparer PostgreSQL pour coexistence avec RediSearch
-- Note: Cette migration N'installe PAS RediSearch, elle prépare le tracking

-- =====================================================================
-- CONTEXTE
-- =====================================================================

-- RediSearch est activé UNIQUEMENT si Phase 1 insuffisante (latence P50 >1.5s)
-- Cette migration crée les structures de tracking pour monitorer dual-write

-- Architecture:
-- PostgreSQL = Source de vérité (TOUJOURS)
-- RediSearch = Cache recherche (lecture seule, rebuild-able)

-- Déclencheur Phase 2:
-- - Latence P50 reste >1.5s après Phase 1
-- - Croissance KB vers 30-50k docs
-- - Budget infrastructure confortable (RAM 512MB Redis)

-- =====================================================================
-- PHASE 1: Table tracking indexation RediSearch
-- =====================================================================

CREATE TABLE IF NOT EXISTS redisearch_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id UUID NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES knowledge_base_chunks(id) ON DELETE CASCADE,
  redis_key TEXT NOT NULL, -- Format: kb:chunk:{chunk_id}
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'error', 'stale')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(chunk_id, redis_key)
);

-- Index pour lookup rapide
CREATE INDEX IF NOT EXISTS idx_redisearch_sync_chunk
  ON redisearch_sync_status (chunk_id);

CREATE INDEX IF NOT EXISTS idx_redisearch_sync_kb
  ON redisearch_sync_status (knowledge_base_id);

CREATE INDEX IF NOT EXISTS idx_redisearch_sync_status
  ON redisearch_sync_status (sync_status)
  WHERE sync_status != 'synced';

-- Index pour monitoring staleness
CREATE INDEX IF NOT EXISTS idx_redisearch_sync_stale
  ON redisearch_sync_status (last_synced_at)
  WHERE sync_status = 'stale';

-- =====================================================================
-- PHASE 2: Vue monitoring synchronisation
-- =====================================================================

CREATE OR REPLACE VIEW vw_redisearch_sync_stats AS
SELECT
  sync_status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage,
  MIN(last_synced_at) as oldest_sync,
  MAX(last_synced_at) as newest_sync,
  EXTRACT(EPOCH FROM (NOW() - MIN(last_synced_at))) / 3600 as max_staleness_hours
FROM redisearch_sync_status
GROUP BY sync_status
ORDER BY count DESC;

COMMENT ON VIEW vw_redisearch_sync_stats IS
'Vue monitoring synchronisation RediSearch.
Objectif: 100% synced, staleness <1h';

-- =====================================================================
-- PHASE 3: Fonction trigger dual-write
-- =====================================================================

CREATE OR REPLACE FUNCTION trigger_redisearch_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Marquer chunk comme "pending" pour resync RediSearch
  INSERT INTO redisearch_sync_status (
    knowledge_base_id,
    chunk_id,
    redis_key,
    sync_status
  )
  VALUES (
    NEW.knowledge_base_id,
    NEW.id,
    'kb:chunk:' || NEW.id::text,
    'pending'
  )
  ON CONFLICT (chunk_id, redis_key)
  DO UPDATE SET
    sync_status = 'pending',
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sur INSERT/UPDATE chunks
CREATE TRIGGER trg_redisearch_sync_insert
  AFTER INSERT OR UPDATE ON knowledge_base_chunks
  FOR EACH ROW
  EXECUTE FUNCTION trigger_redisearch_sync();

COMMENT ON FUNCTION trigger_redisearch_sync() IS
'Trigger dual-write: marque chunks modifiés comme pending pour resync RediSearch';

-- =====================================================================
-- PHASE 4: Vue chunks à synchroniser
-- =====================================================================

CREATE OR REPLACE VIEW vw_redisearch_pending_sync AS
SELECT
  kbc.id as chunk_id,
  kbc.knowledge_base_id,
  kb.title,
  kbc.content AS content_chunk,
  kb.category,
  kb.language,
  kbc.embedding,
  kbc.embedding_openai,
  rs.sync_status,
  rs.last_synced_at,
  EXTRACT(EPOCH FROM (NOW() - rs.last_synced_at)) / 3600 as staleness_hours
FROM knowledge_base_chunks kbc
JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
LEFT JOIN redisearch_sync_status rs ON kbc.id = rs.chunk_id
WHERE rs.sync_status IN ('pending', 'error', 'stale')
   OR rs.chunk_id IS NULL -- Nouveaux chunks jamais indexés
ORDER BY rs.last_synced_at ASC NULLS FIRST
LIMIT 1000;

COMMENT ON VIEW vw_redisearch_pending_sync IS
'Liste chunks à synchroniser vers RediSearch (max 1000).
Utilisé par script cron sync-redisearch.sh';

-- =====================================================================
-- PHASE 5: Fonction cleanup chunks supprimés
-- =====================================================================

CREATE OR REPLACE FUNCTION cleanup_redisearch_orphans()
RETURNS TABLE (
  orphan_count INTEGER,
  deleted_keys TEXT[]
) AS $$
DECLARE
  v_orphan_count INTEGER;
  v_deleted_keys TEXT[];
BEGIN
  -- Trouver chunks dans redisearch_sync_status mais plus dans knowledge_base_chunks
  WITH orphans AS (
    DELETE FROM redisearch_sync_status rs
    WHERE NOT EXISTS (
      SELECT 1 FROM knowledge_base_chunks kbc
      WHERE kbc.id = rs.chunk_id
    )
    RETURNING rs.redis_key
  )
  SELECT COUNT(*), ARRAY_AGG(redis_key)
  INTO v_orphan_count, v_deleted_keys
  FROM orphans;

  RETURN QUERY SELECT v_orphan_count, v_deleted_keys;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_redisearch_orphans() IS
'Nettoie entrées redisearch_sync_status pour chunks supprimés.
Retourne nombre orphelins + liste clés Redis à supprimer.
Exécuter quotidiennement via cron.';

-- =====================================================================
-- PHASE 6: Configuration feature flags
-- =====================================================================

-- Ajouter colonne feature flag dans table system_settings (si existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'system_settings'
  ) THEN
    -- Insérer feature flag RediSearch (désactivé par défaut)
    INSERT INTO system_settings (key, value, description)
    VALUES (
      'USE_REDISEARCH',
      'false',
      'Active recherche via RediSearch (Phase 2). Fallback PostgreSQL si false.'
    )
    ON CONFLICT (key) DO NOTHING;

    INSERT INTO system_settings (key, value, description)
    VALUES (
      'REDISEARCH_SYNC_BATCH_SIZE',
      '100',
      'Nombre chunks à synchroniser par batch vers RediSearch'
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END $$;

-- =====================================================================
-- PHASE 7: Métriques monitoring
-- =====================================================================

CREATE OR REPLACE VIEW vw_redisearch_health AS
SELECT
  (SELECT COUNT(*) FROM knowledge_base_chunks) as total_chunks,
  (SELECT COUNT(*) FROM redisearch_sync_status) as indexed_chunks,
  (SELECT COUNT(*) FROM redisearch_sync_status WHERE sync_status = 'synced') as synced_chunks,
  (SELECT COUNT(*) FROM redisearch_sync_status WHERE sync_status = 'pending') as pending_chunks,
  (SELECT COUNT(*) FROM redisearch_sync_status WHERE sync_status = 'error') as error_chunks,
  (SELECT COUNT(*) FROM redisearch_sync_status WHERE sync_status = 'stale') as stale_chunks,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM redisearch_sync_status WHERE sync_status = 'synced') /
    NULLIF((SELECT COUNT(*) FROM knowledge_base_chunks), 0),
    2
  ) as sync_coverage_pct,
  (SELECT MAX(last_synced_at) FROM redisearch_sync_status) as last_sync_time,
  EXTRACT(EPOCH FROM (NOW() - (SELECT MAX(last_synced_at) FROM redisearch_sync_status))) / 60 as minutes_since_last_sync;

COMMENT ON VIEW vw_redisearch_health IS
'Vue santé RediSearch: couverture sync, chunks pending/error, staleness.
Objectif: sync_coverage_pct = 100%, pending_chunks = 0, error_chunks = 0';

-- =====================================================================
-- COMMENTAIRES
-- =====================================================================

COMMENT ON TABLE redisearch_sync_status IS
'Tracking synchronisation PostgreSQL → RediSearch.
PostgreSQL = source vérité, RediSearch = cache recherche.
Dual-write: INSERT/UPDATE chunks → trigger marque pending → cron sync RediSearch';

-- =====================================================================
-- ROLLBACK (si nécessaire)
-- =====================================================================

-- Pour rollback:
-- DROP TRIGGER IF EXISTS trg_redisearch_sync_insert ON knowledge_base_chunks;
-- DROP FUNCTION IF EXISTS trigger_redisearch_sync() CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_redisearch_orphans() CASCADE;
-- DROP VIEW IF EXISTS vw_redisearch_health;
-- DROP VIEW IF EXISTS vw_redisearch_pending_sync;
-- DROP VIEW IF EXISTS vw_redisearch_sync_stats;
-- DROP TABLE IF EXISTS redisearch_sync_status CASCADE;
