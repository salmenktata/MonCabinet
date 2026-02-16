-- Script SQL d'analyse des VRAIS contenus corrompus dans la KB
-- (exclut les emojis intentionnels et caractères Unicode valides)
-- Usage: psql -U moncabinet -d qadhya -f scripts/analyze-real-corrupted-kb.sql

\echo '================================================'
\echo '🔍 ANALYSE DES VRAIS CONTENUS CORROMPUS KB'
\echo '(Exclut emojis et caractères Unicode légitimes)'
\echo '================================================'
\echo ''

-- 1. Statistiques globales sur full_text (source de vérité)
\echo '📊 Documents avec full_text corrompu ou vide'
\echo '---'
SELECT
  COUNT(*) as total_docs,
  COUNT(*) FILTER (WHERE full_text IS NULL OR full_text = '') as empty_full_text,
  COUNT(*) FILTER (WHERE LENGTH(full_text) < 100) as very_short_full_text,
  COUNT(*) FILTER (
    -- Caractères de remplacement Unicode (corruption réelle)
    WHERE full_text LIKE '%�%'
    OR full_text LIKE '%\uFFFD%'
    OR full_text LIKE '%\x00%'
  ) as with_replacement_chars,
  COUNT(*) FILTER (
    -- Encodage suspect (beaucoup de caractères non-texte consécutifs)
    WHERE full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}'
  ) as with_control_chars
FROM knowledge_base
WHERE is_active = true;

\echo ''
\echo '---'
\echo ''

-- 2. Documents vraiment problématiques (full_text corrompu)
\echo '📄 Documents avec full_text réellement corrompu'
\echo '---'
SELECT
  id,
  title,
  category,
  source_file,
  LENGTH(full_text) as text_length,
  chunk_count,
  CASE
    WHEN full_text IS NULL OR full_text = '' THEN 'empty'
    WHEN LENGTH(full_text) < 100 THEN 'too_short'
    WHEN full_text LIKE '%�%' OR full_text LIKE '%\uFFFD%' THEN 'replacement_chars'
    WHEN full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}' THEN 'control_chars'
  END as issue_type,
  LEFT(full_text, 150) as preview
FROM knowledge_base
WHERE is_active = true
AND (
  full_text IS NULL
  OR full_text = ''
  OR LENGTH(full_text) < 100
  OR full_text LIKE '%�%'
  OR full_text LIKE '%\uFFFD%'
  OR full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}'
)
ORDER BY
  CASE issue_type
    WHEN 'replacement_chars' THEN 1
    WHEN 'control_chars' THEN 2
    WHEN 'too_short' THEN 3
    WHEN 'empty' THEN 4
  END,
  category, title
LIMIT 30;

\echo ''
\echo '---'
\echo ''

-- 3. Répartition par catégorie
\echo '📁 Répartition des vrais documents corrompus par catégorie'
\echo '---'
SELECT
  category,
  COUNT(*) as docs_corrupted,
  COUNT(*) FILTER (WHERE full_text IS NULL OR full_text = '') as empty,
  COUNT(*) FILTER (WHERE LENGTH(full_text) < 100 AND LENGTH(full_text) > 0) as too_short,
  COUNT(*) FILTER (WHERE full_text LIKE '%�%' OR full_text LIKE '%\uFFFD%') as replacement_chars,
  COUNT(*) FILTER (WHERE full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}') as control_chars
FROM knowledge_base
WHERE is_active = true
AND (
  full_text IS NULL
  OR full_text = ''
  OR LENGTH(full_text) < 100
  OR full_text LIKE '%�%'
  OR full_text LIKE '%\uFFFD%'
  OR full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}'
)
GROUP BY category
ORDER BY docs_corrupted DESC;

\echo ''
\echo '---'
\echo ''

-- 4. Incohérences : is_indexed=true mais chunk_count=0
\echo '⚠️  Documents marqués indexés mais sans chunks'
\echo '---'
SELECT
  category,
  COUNT(*) as docs_without_chunks,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM knowledge_base WHERE is_active = true AND is_indexed = true), 1) as pct_of_indexed
FROM knowledge_base
WHERE is_active = true
AND is_indexed = true
AND chunk_count = 0
GROUP BY category
ORDER BY docs_without_chunks DESC;

\echo ''
\echo '---'
\echo ''

-- 5. Statistiques web_sources pour comprendre l'origine
\echo '🌐 Sources web des documents corrompus'
\echo '---'
WITH corrupted_docs AS (
  SELECT id, source_file
  FROM knowledge_base
  WHERE is_active = true
  AND (
    full_text IS NULL
    OR full_text = ''
    OR LENGTH(full_text) < 100
    OR full_text LIKE '%�%'
    OR full_text LIKE '%\uFFFD%'
    OR full_text ~ '[\x00-\x08\x0B\x0C\x0E-\x1F]{3,}'
  )
)
SELECT
  CASE
    WHEN cd.source_file LIKE 'http%' THEN
      SUBSTRING(cd.source_file FROM '^https?://([^/]+)')
    ELSE 'local_upload'
  END as source_domain,
  COUNT(*) as corrupted_count
FROM corrupted_docs cd
GROUP BY source_domain
ORDER BY corrupted_count DESC
LIMIT 10;

\echo ''
\echo '================================================'
\echo '✅ Analyse des VRAIS documents corrompus terminée'
\echo '================================================'
\echo ''
\echo '🔍 Résumé :'
\echo '  - Les emojis (📖⚖️📕📑) sont intentionnels et ajoutés par le chunking'
\echo '  - Seuls les documents avec full_text réellement corrompu sont listés'
\echo '  - Critères de corruption : caractères de remplacement, contrôle, vides, trop courts'
\echo ''
