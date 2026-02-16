-- Script SQL d'analyse des contenus corrompus dans la KB
-- Usage: psql -U moncabinet -d qadhya -f scripts/analyze-corrupted-kb.sql

\echo '================================================'
\echo '🔍 ANALYSE DES CONTENUS CORROMPUS KB'
\echo '================================================'
\echo ''

-- 1. Statistiques globales
\echo '📊 Statistiques globales des chunks'
\echo '---'
SELECT
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE content IS NULL OR content = '') as empty_chunks,
  COUNT(*) FILTER (WHERE LENGTH(content) < 50) as very_short_chunks,
  COUNT(*) FILTER (
    WHERE content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
  ) as chunks_with_invalid_chars
FROM knowledge_base_chunks kbc
INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true;

\echo ''
\echo '---'
\echo ''

-- 2. Documents avec chunks corrompus (ratio >= 50%)
\echo '📄 Documents avec ≥50% de chunks corrompus (seront nettoyés)'
\echo '---'
WITH corrupted_chunks AS (
  SELECT
    kbc.knowledge_base_id,
    COUNT(*) as total_chunks,
    COUNT(*) FILTER (
      WHERE content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
      OR LENGTH(content) < 50
      OR content IS NULL
      OR content = ''
    ) as corrupted_count
  FROM knowledge_base_chunks kbc
  INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
  GROUP BY kbc.knowledge_base_id
)
SELECT
  kb.id,
  kb.title,
  kb.category,
  kb.source_file,
  cc.corrupted_count,
  cc.total_chunks,
  ROUND(100.0 * cc.corrupted_count / cc.total_chunks, 1) as corruption_pct
FROM corrupted_chunks cc
INNER JOIN knowledge_base kb ON cc.knowledge_base_id = kb.id
WHERE cc.corrupted_count::float / cc.total_chunks >= 0.5
ORDER BY corruption_pct DESC, cc.corrupted_count DESC
LIMIT 20;

\echo ''
\echo '---'
\echo ''

-- 3. Répartition par catégorie
\echo '📁 Répartition des documents corrompus par catégorie'
\echo '---'
WITH corrupted_chunks AS (
  SELECT
    kbc.knowledge_base_id,
    COUNT(*) as total_chunks,
    COUNT(*) FILTER (
      WHERE content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
      OR LENGTH(content) < 50
      OR content IS NULL
      OR content = ''
    ) as corrupted_count
  FROM knowledge_base_chunks kbc
  INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE kb.is_active = true
  GROUP BY kbc.knowledge_base_id
),
corrupted_docs AS (
  SELECT
    kb.category,
    kb.id
  FROM corrupted_chunks cc
  INNER JOIN knowledge_base kb ON cc.knowledge_base_id = kb.id
  WHERE cc.corrupted_count::float / cc.total_chunks >= 0.5
)
SELECT
  category,
  COUNT(*) as docs_to_clean
FROM corrupted_docs
GROUP BY category
ORDER BY docs_to_clean DESC;

\echo ''
\echo '---'
\echo ''

-- 4. Exemples de chunks corrompus
\echo '🔍 Exemples de chunks corrompus (prévisualisation)'
\echo '---'
SELECT
  kb.title,
  kb.category,
  LENGTH(kbc.content) as chunk_length,
  LEFT(kbc.content, 100) as preview,
  CASE
    WHEN kbc.content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]' THEN 'invalid_chars'
    WHEN LENGTH(kbc.content) < 50 THEN 'too_short'
    WHEN kbc.content IS NULL OR kbc.content = '' THEN 'empty'
  END as issue_type
FROM knowledge_base_chunks kbc
INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
WHERE kb.is_active = true
AND (
  kbc.content ~ '[^\x20-\x7E\x0A\x0D\x09\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]'
  OR LENGTH(kbc.content) < 50
  OR kbc.content IS NULL
  OR kbc.content = ''
)
ORDER BY kb.category, kb.title
LIMIT 10;

\echo ''
\echo '================================================'
\echo '✅ Analyse terminée'
\echo '================================================'
\echo ''
\echo '🔄 Prochaines étapes :'
\echo '  1. Vérifier les documents ci-dessus'
\echo '  2. Si OK, lancer : npx tsx scripts/cleanup-corrupted-kb.ts'
\echo '  3. Puis réindexer : npx tsx scripts/reindex-kb-improved.ts'
\echo ''
