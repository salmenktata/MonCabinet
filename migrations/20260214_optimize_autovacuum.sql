-- Migration: Optimisation Autovacuum pour Tables KB
-- Date: 2026-02-14
-- Objectif: Réduire bloat des tables/indexes HNSW pour maintenir performance recherche
-- Impact: Dead tuples <5%, latence P95 -10-15%

-- =====================================================================
-- CONTEXTE
-- =====================================================================

-- Problème actuel:
-- - Autovacuum par défaut conservateur (vacuum à 20% updates)
-- - Tables KB haute fréquence updates (indexation continue)
-- - Bloat index HNSW dégrade performance recherche vectorielle
-- - Dead tuples > 10% → cache hit rate diminue

-- Solution:
-- - Autovacuum agressif pour knowledge_base_chunks (table critique)
-- - Autovacuum modéré pour knowledge_base (table moins critique)
-- - VACUUM manuel initial pour nettoyer bloat existant

-- =====================================================================
-- PHASE 1: Tuning Autovacuum pour knowledge_base_chunks (table critique)
-- =====================================================================

ALTER TABLE knowledge_base_chunks SET (
  -- Vacuum à 5% updates (vs 20% default)
  -- Calcul déclenchement: 50 + 0.05 * tuples = ~750 updates pour 14k chunks
  autovacuum_vacuum_scale_factor = 0.05,

  -- Analyze à 2% updates (statistiques à jour)
  -- Critique pour query planner index partiels
  autovacuum_analyze_scale_factor = 0.02,

  -- Cost limit agressif (500 vs 200 default)
  -- Vacuum plus rapide mais CPU++
  autovacuum_vacuum_cost_limit = 500,

  -- Freeze age conservateur pour éviter wraparound
  autovacuum_freeze_min_age = 50000000,
  autovacuum_freeze_max_age = 200000000
);

-- =====================================================================
-- PHASE 2: Tuning Autovacuum pour knowledge_base (table moins critique)
-- =====================================================================

ALTER TABLE knowledge_base SET (
  -- Vacuum à 10% updates (moins agressif que chunks)
  autovacuum_vacuum_scale_factor = 0.1,

  -- Analyze à 5% updates
  autovacuum_analyze_scale_factor = 0.05,

  -- Cost limit standard
  autovacuum_vacuum_cost_limit = 400
);

-- =====================================================================
-- PHASE 3: Tuning pour kb_structured_metadata (JOIN fréquent)
-- =====================================================================

ALTER TABLE kb_structured_metadata SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.05
);

-- =====================================================================
-- PHASE 4: Tuning pour kb_legal_relations (relations citations)
-- =====================================================================

ALTER TABLE kb_legal_relations SET (
  autovacuum_vacuum_scale_factor = 0.15,
  autovacuum_analyze_scale_factor = 0.1
);

-- =====================================================================
-- PHASE 5: VACUUM manuel initial (nettoyer bloat existant)
-- =====================================================================

-- VACUUM FULL bloque la table → ÉVITER en production
-- Utiliser VACUUM standard avec ANALYZE

-- Table critique chunks (peut prendre 2-5min)
VACUUM (ANALYZE, VERBOSE) knowledge_base_chunks;

-- Table principale KB
VACUUM (ANALYZE, VERBOSE) knowledge_base;

-- Tables metadata
VACUUM (ANALYZE) kb_structured_metadata;
VACUUM (ANALYZE) kb_legal_relations;
VACUUM (ANALYZE) knowledge_base_views;

-- =====================================================================
-- PHASE 6: Vue monitoring bloat tables
-- =====================================================================

CREATE OR REPLACE VIEW vw_table_bloat AS
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  n_live_tup as live_tuples,
  n_dead_tup as dead_tuples,
  ROUND(100.0 * n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0), 1) as dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  CASE
    WHEN n_dead_tup = 0 THEN '🟢 Propre (0 dead)'
    WHEN n_dead_tup < 100 THEN '🟢 Excellent (<100 dead)'
    WHEN n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) < 0.05 THEN '🟢 Bon (<5% dead)'
    WHEN n_dead_tup::float / NULLIF(n_live_tup + n_dead_tup, 0) < 0.1 THEN '🟡 Acceptable (5-10% dead)'
    ELSE '🔴 Bloat critique (>10% dead)'
  END as bloat_status,
  EXTRACT(EPOCH FROM (NOW() - GREATEST(last_vacuum, last_autovacuum))) / 3600 as hours_since_last_vacuum
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY dead_pct DESC NULLS LAST;

-- =====================================================================
-- PHASE 7: Vue monitoring bloat indexes
-- =====================================================================

CREATE OR REPLACE VIEW vw_index_bloat AS
SELECT
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as scans_count,
  -- Estimation bloat (approximative)
  pg_size_pretty(
    pg_relation_size(indexrelid) -
    (pg_relation_size(indexrelid) * 0.1)  -- Assume 10% bloat baseline
  ) as estimated_bloat,
  CASE
    WHEN pg_relation_size(indexrelid) < 10*1024*1024 THEN '🟢 Petit (<10MB)'
    WHEN pg_relation_size(indexrelid) < 100*1024*1024 THEN '🟡 Moyen (10-100MB)'
    ELSE '🔴 Large (>100MB)'
  END as size_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename LIKE 'knowledge_base%'
ORDER BY pg_relation_size(indexrelid) DESC;

-- =====================================================================
-- PHASE 8: Fonction helper pour vacuum manuel ciblé
-- =====================================================================

CREATE OR REPLACE FUNCTION vacuum_kb_tables()
RETURNS TABLE (
  table_name text,
  before_dead_tuples bigint,
  after_dead_tuples bigint,
  bloat_reduction_pct numeric,
  duration_ms bigint
) AS $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  before_stats record;
  after_stats record;
BEGIN
  -- knowledge_base_chunks
  SELECT n_dead_tup INTO before_stats FROM pg_stat_user_tables WHERE tablename = 'knowledge_base_chunks';
  start_time := clock_timestamp();
  VACUUM (ANALYZE) knowledge_base_chunks;
  end_time := clock_timestamp();
  SELECT n_dead_tup INTO after_stats FROM pg_stat_user_tables WHERE tablename = 'knowledge_base_chunks';

  RETURN QUERY SELECT
    'knowledge_base_chunks'::text,
    before_stats.n_dead_tup,
    after_stats.n_dead_tup,
    ROUND(100.0 * (before_stats.n_dead_tup - after_stats.n_dead_tup)::numeric / NULLIF(before_stats.n_dead_tup, 0), 2),
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::bigint;

  -- knowledge_base
  SELECT n_dead_tup INTO before_stats FROM pg_stat_user_tables WHERE tablename = 'knowledge_base';
  start_time := clock_timestamp();
  VACUUM (ANALYZE) knowledge_base;
  end_time := clock_timestamp();
  SELECT n_dead_tup INTO after_stats FROM pg_stat_user_tables WHERE tablename = 'knowledge_base';

  RETURN QUERY SELECT
    'knowledge_base'::text,
    before_stats.n_dead_tup,
    after_stats.n_dead_tup,
    ROUND(100.0 * (before_stats.n_dead_tup - after_stats.n_dead_tup)::numeric / NULLIF(before_stats.n_dead_tup, 0), 2),
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::bigint;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- COMMENTAIRES
-- =====================================================================

COMMENT ON VIEW vw_table_bloat IS
'Vue monitoring bloat tables KB. Objectif: dead_pct <5%.
Commande fix: VACUUM (ANALYZE) <table>;';

COMMENT ON VIEW vw_index_bloat IS
'Vue monitoring taille indexes KB. Si index >100MB, envisager REINDEX CONCURRENTLY.';

COMMENT ON FUNCTION vacuum_kb_tables() IS
'Fonction helper pour vacuum manuel ciblé tables KB avec métriques avant/après.
Usage: SELECT * FROM vacuum_kb_tables();';

-- =====================================================================
-- CRON RECOMMANDÉ (à ajouter dans cron-daily.sh)
-- =====================================================================

-- Ajouter dans /opt/qadhya/scripts/cron-daily.sh:
-- psql -U moncabinet -d qadhya -c "SELECT * FROM vacuum_kb_tables();"

-- =====================================================================
-- VALIDATION
-- =====================================================================

-- Vérifier tuning appliqué:
SELECT
  tablename,
  reloptions
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'knowledge_base%';

-- Résultat attendu:
-- knowledge_base_chunks | {autovacuum_vacuum_scale_factor=0.05,...}
-- knowledge_base        | {autovacuum_vacuum_scale_factor=0.1,...}

-- Vérifier bloat actuel:
SELECT * FROM vw_table_bloat WHERE tablename LIKE 'knowledge_base%';

-- Objectif: dead_pct <5% pour toutes tables KB

-- =====================================================================
-- MONITORING AUTOVACUUM LOGS (optionnel)
-- =====================================================================

-- Pour activer logs autovacuum détaillés (debug only):
-- ALTER TABLE knowledge_base_chunks SET (log_autovacuum_min_duration = 0);

-- Puis chercher logs:
-- docker logs qadhya-postgres 2>&1 | grep "autovacuum" | tail -20

-- =====================================================================
-- ROLLBACK (si nécessaire)
-- =====================================================================

-- Pour restaurer paramètres par défaut:
-- ALTER TABLE knowledge_base_chunks RESET (
--   autovacuum_vacuum_scale_factor,
--   autovacuum_analyze_scale_factor,
--   autovacuum_vacuum_cost_limit,
--   autovacuum_freeze_min_age,
--   autovacuum_freeze_max_age
-- );
-- ALTER TABLE knowledge_base RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor, autovacuum_vacuum_cost_limit);
-- ALTER TABLE kb_structured_metadata RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
-- ALTER TABLE kb_legal_relations RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);

-- DROP VIEW IF EXISTS vw_table_bloat;
-- DROP VIEW IF EXISTS vw_index_bloat;
-- DROP FUNCTION IF EXISTS vacuum_kb_tables();
