-- Script de correction du chunk_count pour les documents indexés
-- Usage: psql -U moncabinet -d qadhya -f scripts/fix-chunk-count.sql

\echo '================================================'
\echo '🔧 CORRECTION DU CHUNK_COUNT'
\echo '================================================'
\echo ''

-- 1. Afficher l'état avant correction
\echo '📊 État AVANT correction'
\echo '---'
SELECT
  COUNT(*) FILTER (WHERE chunk_count = 0) as avec_count_zero,
  COUNT(*) FILTER (WHERE chunk_count > 0) as avec_count_positif,
  COUNT(*) as total
FROM knowledge_base
WHERE is_active = true
AND is_indexed = true;

\echo ''
\echo '---'
\echo ''

-- 2. Prévisualiser les corrections (DRY RUN)
\echo '🔍 Prévisualisation des corrections (10 premiers)'
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
  title,
  category,
  old_count,
  new_count,
  new_count - old_count as delta
FROM chunk_counts
ORDER BY ABS(new_count - old_count) DESC
LIMIT 10;

\echo ''
\echo '---'
\echo ''
\echo '⚠️  ATTENTION : Cette correction va modifier la base de données'
\echo 'Appuyez sur Ctrl+C pour annuler, ou sur Entrée pour continuer...'
\prompt 'Continuer ? [y/N] ' confirm

\if :{?confirm}
  \if :confirm = 'y'
    \echo ''
    \echo '🔄 Application de la correction...'
    \echo ''

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

    \echo ''
    \echo '✅ Correction appliquée'
    \echo ''

    -- 4. Afficher l'état après correction
    \echo '📊 État APRÈS correction'
    \echo '---'
    SELECT
      COUNT(*) FILTER (WHERE chunk_count = 0) as avec_count_zero,
      COUNT(*) FILTER (WHERE chunk_count > 0) as avec_count_positif,
      COUNT(*) as total
    FROM knowledge_base
    WHERE is_active = true
    AND is_indexed = true;

    \echo ''
    \echo '---'
    \echo ''

    -- 5. Statistiques par catégorie
    \echo '📁 Statistiques par catégorie APRÈS correction'
    \echo '---'
    SELECT
      category,
      COUNT(*) as total_docs,
      SUM(chunk_count) as total_chunks,
      ROUND(AVG(chunk_count), 1) as avg_chunks_per_doc
    FROM knowledge_base
    WHERE is_active = true
    AND is_indexed = true
    GROUP BY category
    ORDER BY total_chunks DESC;

    \echo ''
    \echo '================================================'
    \echo '✅ CORRECTION TERMINÉE AVEC SUCCÈS'
    \echo '================================================'
  \else
    \echo ''
    \echo '❌ Correction annulée par l''utilisateur'
    \echo ''
  \endif
\else
  \echo ''
  \echo '❌ Correction annulée'
  \echo ''
\endif
