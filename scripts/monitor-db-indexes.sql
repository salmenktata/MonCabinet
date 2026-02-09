-- =========================================================================
-- Script de Monitoring Index PostgreSQL
-- =========================================================================
-- Usage:
--   psql -U moncabinet -d moncabinet -f scripts/monitor-db-indexes.sql
--
-- Ou via SSH/Docker:
--   ssh root@84.247.165.187 "docker exec -i moncabinet-postgres \
--     psql -U moncabinet -d moncabinet -f /opt/moncabinet/scripts/monitor-db-indexes.sql"
-- =========================================================================

\echo '========================================='
\echo '📊 Monitoring Index PostgreSQL'
\echo '========================================='
\echo ''

-- =========================================================================
-- 1. Résumé Global
-- =========================================================================
\echo '1️⃣  RÉSUMÉ GLOBAL'
\echo '─────────────────────────────────────────'

SELECT
  count(*) as total_indexes,
  count(*) FILTER (WHERE idx_scan > 0) as used_indexes,
  count(*) FILTER (WHERE idx_scan = 0) as unused_indexes,
  round(100.0 * count(*) FILTER (WHERE idx_scan > 0) / count(*), 1) as used_pct,
  round(100.0 * count(*) FILTER (WHERE idx_scan = 0) / count(*), 1) as unused_pct,
  pg_size_pretty(sum(pg_relation_size(indexrelid))) as total_size,
  pg_size_pretty(sum(pg_relation_size(indexrelid)) FILTER (WHERE idx_scan = 0)) as unused_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public';

\echo ''

-- =========================================================================
-- 2. Top 20 Index les Plus Utilisés
-- =========================================================================
\echo '2️⃣  TOP 20 INDEX LES PLUS UTILISÉS'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC
LIMIT 20;

\echo ''

-- =========================================================================
-- 3. Index Jamais Utilisés (Taille > 100 KB)
-- =========================================================================
\echo '3️⃣  INDEX JAMAIS UTILISÉS (> 100 KB)'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  pg_get_indexdef(indexrelid) as definition
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND pg_relation_size(indexrelid) > 100 * 1024
  AND indexrelname NOT LIKE '%_pkey'
  AND indexrelname NOT LIKE 'unique_%'
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- =========================================================================
-- 4. Index RAG/Vectoriels (HNSW)
-- =========================================================================
\echo '4️⃣  INDEX RAG/VECTORIELS (HNSW)'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE
    WHEN idx_scan = 0 THEN '⚠️  Jamais utilisé'
    WHEN idx_scan < 10 THEN '⏳ Peu utilisé'
    ELSE '✅ Actif'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname LIKE '%_vector%'
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- =========================================================================
-- 5. Index Full-Text (GIN)
-- =========================================================================
\echo '5️⃣  INDEX FULL-TEXT (GIN)'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE
    WHEN idx_scan = 0 THEN '⚠️  Jamais utilisé'
    WHEN idx_scan < 10 THEN '⏳ Peu utilisé'
    ELSE '✅ Actif'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (indexrelname LIKE '%_fts' OR indexrelname LIKE '%fulltext%')
ORDER BY pg_relation_size(indexrelid) DESC;

\echo ''

-- =========================================================================
-- 6. Index Tables Critiques (web_pages, knowledge_base, dossiers)
-- =========================================================================
\echo '6️⃣  INDEX TABLES CRITIQUES'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE
    WHEN idx_scan = 0 THEN '⚠️'
    WHEN idx_scan < 100 THEN '⏳'
    ELSE '✅'
  END as status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND relname IN ('web_pages', 'knowledge_base', 'knowledge_base_chunks', 'dossiers', 'documents', 'clients')
ORDER BY relname, idx_scan DESC;

\echo ''

-- =========================================================================
-- 7. Index Peu Utilisés (Candidats Investigation)
-- =========================================================================
\echo '7️⃣  INDEX PEU UTILISÉS (1-10 scans)'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  indexrelname as index_name,
  idx_scan as scans,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan > 0
  AND idx_scan <= 10
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC
LIMIT 20;

\echo ''

-- =========================================================================
-- 8. Taille Index par Table
-- =========================================================================
\echo '8️⃣  TAILLE TOTALE INDEX PAR TABLE'
\echo '─────────────────────────────────────────'

SELECT
  relname as table_name,
  count(*) as nb_indexes,
  pg_size_pretty(sum(pg_relation_size(indexrelid))) as total_size,
  pg_size_pretty(pg_relation_size(relname::regclass)) as table_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY relname
ORDER BY sum(pg_relation_size(indexrelid)) DESC
LIMIT 20;

\echo ''

-- =========================================================================
-- 9. Index Doublons Potentiels
-- =========================================================================
\echo '9️⃣  INDEX DOUBLONS POTENTIELS'
\echo '─────────────────────────────────────────'
\echo 'Index sur mêmes colonnes (vérification manuelle requise)'

SELECT
  relname as table_name,
  array_agg(indexrelname ORDER BY indexrelname) as index_names,
  count(*) as nb_indexes,
  pg_get_indexdef(min(indexrelid)) as first_index_def
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
GROUP BY relname, idx_tup_read, idx_tup_fetch
HAVING count(*) > 1
ORDER BY count(*) DESC;

\echo ''

-- =========================================================================
-- 10. Recommandations Automatiques
-- =========================================================================
\echo '🎯 RECOMMANDATIONS AUTOMATIQUES'
\echo '─────────────────────────────────────────'

-- Compter index jamais utilisés > 1 MB
SELECT
  count(*) as nb_large_unused,
  pg_size_pretty(sum(pg_relation_size(indexrelid))) as total_wasted_space
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND pg_relation_size(indexrelid) > 1024 * 1024
  AND indexrelname NOT LIKE '%_pkey'
  AND indexrelname NOT LIKE 'unique_%'
  AND indexrelname NOT LIKE '%_vector%'  -- Exclure RAG
  AND indexrelname NOT LIKE '%fulltext%'; -- Exclure full-text

\echo ''
\echo '📋 ACTIONS RECOMMANDÉES:'
\echo '  1. Activer recherche full-text pour tester index GIN'
\echo '  2. Activer système RAG pour tester index HNSW'
\echo '  3. Réévaluer index jamais utilisés dans 1 mois'
\echo '  4. Supprimer index confirmés inutiles (scans = 0 après 1 mois)'
\echo ''
\echo '✅ Monitoring terminé'
\echo '─────────────────────────────────────────'
