-- Script de correction automatique du chunk_count
-- (Version non-interactive pour exécution SSH)

\echo '================================================'
\echo '🔧 CORRECTION AUTOMATIQUE DU CHUNK_COUNT'
\echo '================================================'
\echo ''

-- 1. État AVANT
\echo '📊 État AVANT correction'
\echo '---'
SELECT
  COUNT(*) FILTER (WHERE chunk_count = 0 AND EXISTS (SELECT 1 FROM knowledge_base_chunks WHERE knowledge_base_id = knowledge_base.id)) as count_zero_avec_chunks,
  COUNT(*) FILTER (WHERE chunk_count = 0) as count_zero_total,
  COUNT(*) as total_indexed
FROM knowledge_base
WHERE is_active = true
AND is_indexed = true;

\echo ''

-- 2. Prévisualisation TOP 15
\echo '🔍 TOP 15 corrections à appliquer'
\echo '---'
WITH chunk_counts AS (
  SELECT
    kb.id,
    kb.title,
    kb.category,
    kb.chunk_count as old_count,
    COUNT(kbc.id) as new_count
  FROM knowledge_base kb
  LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  WHERE kb.is_active = true
  AND kb.is_indexed = true
  GROUP BY kb.id, kb.title, kb.category, kb.chunk_count
  HAVING kb.chunk_count != COUNT(kbc.id)
)
SELECT
  LEFT(title, 40) as title_short,
  category,
  old_count,
  new_count,
  new_count - old_count as delta
FROM chunk_counts
ORDER BY ABS(new_count - old_count) DESC
LIMIT 15;

\echo ''
\echo '🔄 Application de la correction...'

-- 3. Appliquer la correction
WITH chunk_counts AS (
  SELECT
    kb.id,
    COUNT(kbc.id) as actual_count
  FROM knowledge_base kb
  LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  WHERE kb.is_active = true
  AND kb.is_indexed = true
  GROUP BY kb.id
)
UPDATE knowledge_base kb
SET
  chunk_count = cc.actual_count,
  updated_at = NOW()
FROM chunk_counts cc
WHERE kb.id = cc.id
AND kb.chunk_count != cc.actual_count;

\echo '✅ Correction appliquée'
\echo ''

-- 4. État APRÈS
\echo '📊 État APRÈS correction'
\echo '---'
SELECT
  COUNT(*) FILTER (WHERE chunk_count = 0) as count_zero,
  COUNT(*) FILTER (WHERE chunk_count > 0) as count_positif,
  SUM(chunk_count) as total_chunks,
  ROUND(AVG(chunk_count), 1) as avg_chunks_per_doc
FROM knowledge_base
WHERE is_active = true
AND is_indexed = true;

\echo ''

-- 5. Par catégorie
\echo '📁 Statistiques par catégorie'
\echo '---'
SELECT
  category,
  COUNT(*) as docs,
  SUM(chunk_count) as chunks,
  ROUND(AVG(chunk_count), 1) as avg
FROM knowledge_base
WHERE is_active = true
AND is_indexed = true
GROUP BY category
ORDER BY chunks DESC;

\echo ''
\echo '================================================'
\echo '✅ CORRECTION TERMINÉE'
\echo '================================================'
