-- ============================================================================
-- AUDIT QUALITÉ DES DONNÉES RAG - Phase 1
-- ============================================================================
-- Objectif : Identifier problèmes critiques dans les 3 piliers (source, chunking, métadonnées)
-- Seuils d'alerte : 🔴 CRITIQUE, 🟡 WARNING, ✅ OK
-- Date : 2026-02-10
-- ============================================================================

-- ============================================================================
-- 1. QUALITÉ DU CONTENU SOURCE
-- ============================================================================

-- A1 - Pages indexées de faible qualité ⚠️ CRITIQUE
-- Seuils : 🔴 >10% pages avec score < 70, 🟡 >20% sans score, ✅ <5% problématiques
SELECT
  wp.id,
  wp.url,
  wp.quality_score,
  wp.word_count,
  wp.chunks_count,
  ws.name as source_name,
  wp.last_indexed_at,
  CASE
    WHEN wp.quality_score IS NULL THEN 'MISSING_SCORE'
    WHEN wp.quality_score < 60 THEN 'CRITICAL'
    WHEN wp.quality_score < 70 THEN 'WARNING'
    ELSE 'OK'
  END as severity
FROM web_pages wp
JOIN web_sources ws ON wp.web_source_id = ws.id
WHERE wp.is_indexed = true
  AND (
    wp.quality_score < 70         -- En dessous du seuil optimal
    OR wp.word_count < 500         -- Contenu suspicieusement court
    OR wp.quality_score IS NULL    -- Jamais analysé
  )
ORDER BY wp.quality_score ASC NULLS FIRST
LIMIT 100;

-- A2 - Distribution de qualité par source
SELECT
  ws.id as source_id,
  ws.name,
  ws.category,
  COUNT(*) as total_indexed,
  ROUND(AVG(wp.quality_score), 1) as avg_quality,
  MIN(wp.quality_score) as min_quality,
  MAX(wp.quality_score) as max_quality,
  COUNT(*) FILTER (WHERE wp.quality_score IS NULL) as count_no_score,
  COUNT(*) FILTER (WHERE wp.quality_score < 60) as count_auto_reject,
  COUNT(*) FILTER (WHERE wp.quality_score BETWEEN 60 AND 80) as count_review,
  COUNT(*) FILTER (WHERE wp.quality_score >= 80) as count_excellent,
  ROUND(100.0 * COUNT(*) FILTER (WHERE wp.quality_score >= 80) / NULLIF(COUNT(*), 0), 1) as pct_excellent
FROM web_sources ws
JOIN web_pages wp ON ws.id = wp.web_source_id
WHERE wp.is_indexed = true
GROUP BY ws.id, ws.name, ws.category
ORDER BY avg_quality ASC NULLS FIRST;

-- ============================================================================
-- 2. ANALYSE DU CHUNKING
-- ============================================================================

-- B1 - Chunks problématiques (trop petits/grands)
-- Seuils : 🔴 >5% chunks <200 ou >2000 chars, ✅ 95%+ entre 200-2000
WITH chunk_issues AS (
  SELECT
    CASE
      WHEN LENGTH(kbc.content) < 200 THEN 'too_small'
      WHEN LENGTH(kbc.content) > 2000 THEN 'too_large'
    END as issue_type,
    kbc.id as chunk_id,
    LENGTH(kbc.content) as size_chars,
    LENGTH(kbc.content) - LENGTH(REPLACE(kbc.content, ' ', '')) + 1 as size_words,
    kb.id as doc_id,
    kb.title,
    kb.category
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
  WHERE LENGTH(kbc.content) < 200 OR LENGTH(kbc.content) > 2000
)
SELECT
  issue_type,
  COUNT(*) as chunk_count,
  ROUND(AVG(size_chars)) as avg_chars,
  ROUND(AVG(size_words)) as avg_words,
  doc_id,
  title,
  category
FROM chunk_issues
GROUP BY issue_type, doc_id, title, category
HAVING COUNT(*) > 2  -- Documents avec plusieurs chunks problématiques
ORDER BY issue_type, chunk_count DESC
LIMIT 50;

-- B2 - Distribution de taille par catégorie
WITH chunk_stats AS (
  SELECT
    LENGTH(kbc.content) as char_count,
    LENGTH(kbc.content) - LENGTH(REPLACE(kbc.content, ' ', '')) + 1 as word_count,
    kb.category
  FROM knowledge_base_chunks kbc
  JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
)
SELECT
  category,
  COUNT(*) as total_chunks,
  ROUND(AVG(word_count)) as avg_words,
  ROUND(MIN(word_count)) as min_words,
  ROUND(MAX(word_count)) as max_words,
  ROUND(STDDEV(word_count)) as stddev_words,
  COUNT(*) FILTER (WHERE word_count < 100) as count_tiny,
  COUNT(*) FILTER (WHERE word_count BETWEEN 100 AND 800) as count_normal,
  COUNT(*) FILTER (WHERE word_count > 800) as count_huge,
  ROUND(100.0 * COUNT(*) FILTER (WHERE word_count BETWEEN 100 AND 800) / NULLIF(COUNT(*), 0), 1) as pct_normal
FROM chunk_stats
GROUP BY category
ORDER BY avg_words DESC;

-- ============================================================================
-- 3. QUALITÉ DES MÉTADONNÉES
-- ============================================================================

-- C1 - Extractions de faible confiance
-- Seuils : 🔴 Couverture <50% sources jurisprudence, 🟡 avg_confidence <0.70, ✅ >70% coverage + >0.75 confidence
SELECT
  wpm.id,
  wp.url,
  wp.title,
  ws.name as source_name,
  wpm.document_type,
  wpm.tribunal,
  wpm.chambre,
  wpm.extraction_confidence,
  wpm.llm_provider,
  CASE
    WHEN wpm.extraction_confidence < 0.60 THEN 'CRITICAL'
    WHEN wpm.extraction_confidence < 0.75 THEN 'WARNING'
    ELSE 'OK'
  END as confidence_level
FROM web_page_structured_metadata wpm
JOIN web_pages wp ON wpm.web_page_id = wp.id
JOIN web_sources ws ON wp.web_source_id = ws.id
WHERE wpm.extraction_confidence < 0.75  -- Seuil de fiabilité
  AND wp.is_indexed = true
ORDER BY wpm.extraction_confidence ASC
LIMIT 100;

-- C2 - Couverture métadonnées par source
SELECT
  ws.id as source_id,
  ws.name,
  ws.category,
  COUNT(DISTINCT wp.id) as total_pages,
  COUNT(DISTINCT wpm.id) as pages_with_metadata,
  ROUND(100.0 * COUNT(DISTINCT wpm.id) / NULLIF(COUNT(DISTINCT wp.id), 0), 1) as coverage_pct,
  ROUND(AVG(wpm.extraction_confidence)::numeric, 2) as avg_confidence,
  COUNT(*) FILTER (WHERE wpm.tribunal IS NOT NULL) as has_tribunal,
  COUNT(*) FILTER (WHERE wpm.chambre IS NOT NULL) as has_chambre,
  COUNT(*) FILTER (WHERE wpm.document_date IS NOT NULL) as has_date,
  COUNT(*) FILTER (WHERE wpm.numero_decision IS NOT NULL) as has_numero,
  CASE
    WHEN ws.category = 'jurisprudence' AND COUNT(DISTINCT wpm.id) * 100.0 / NULLIF(COUNT(DISTINCT wp.id), 0) < 50 THEN 'CRITICAL'
    WHEN COUNT(DISTINCT wpm.id) * 100.0 / NULLIF(COUNT(DISTINCT wp.id), 0) < 70 THEN 'WARNING'
    ELSE 'OK'
  END as coverage_status
FROM web_sources ws
JOIN web_pages wp ON ws.id = wp.web_source_id
LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id
WHERE wp.is_indexed = true
GROUP BY ws.id, ws.name, ws.category
ORDER BY coverage_pct DESC;

-- ============================================================================
-- 4. DOUBLONS ET EMBEDDINGS
-- ============================================================================

-- D1 - Validation dimensions des embeddings ⚠️ BLOQUANT
-- Seuil : 🔴 ANY wrong_dimension > 0 (casse la recherche vectorielle)
SELECT
  'knowledge_base' as table_name,
  COUNT(*) as total_docs,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (
    WHERE embedding IS NOT NULL
    AND array_length(embedding::real[], 1) != 1024
  ) as wrong_dimension,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE embedding IS NOT NULL
      AND array_length(embedding::real[], 1) != 1024
    ) > 0 THEN 'CRITICAL'
    WHEN COUNT(*) FILTER (WHERE embedding IS NULL) > 0 THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM knowledge_base
WHERE is_indexed = true

UNION ALL

SELECT
  'knowledge_base_chunks' as table_name,
  COUNT(*) as total_chunks,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
  COUNT(*) FILTER (
    WHERE embedding IS NOT NULL
    AND array_length(embedding::real[], 1) != 1024
  ) as wrong_dimension,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE embedding IS NOT NULL
      AND array_length(embedding::real[], 1) != 1024
    ) > 0 THEN 'CRITICAL'
    WHEN COUNT(*) FILTER (WHERE embedding IS NULL) > 0 THEN 'WARNING'
    ELSE 'OK'
  END as status
FROM knowledge_base_chunks;

-- D2 - Doublons d'URL
SELECT
  wp.url_hash,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(wp.id ORDER BY wp.last_crawled_at DESC) as page_ids,
  ARRAY_AGG(wp.url ORDER BY wp.last_crawled_at DESC) as urls,
  ARRAY_AGG(ws.name ORDER BY wp.last_crawled_at DESC) as source_names,
  MAX(wp.last_crawled_at) as latest_crawl
FROM web_pages wp
JOIN web_sources ws ON wp.web_source_id = ws.id
WHERE wp.is_indexed = true
GROUP BY wp.url_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 50;

-- ============================================================================
-- 5. OVERALL RAG HEALTH SCORE
-- ============================================================================
-- Objectif : ≥ 85/100
-- Formule : (pct_high_quality * 0.5) + (pct_good_chunks * 0.3) + (pct_confident_metadata * 0.2)

WITH metrics AS (
  SELECT
    -- Source Quality (objectif: 80%+ pages avec score >= 80)
    COUNT(DISTINCT wp.id) FILTER (WHERE wp.quality_score >= 80) * 100.0 / NULLIF(COUNT(DISTINCT wp.id), 0) as pct_high_quality,

    -- Chunking Quality (objectif: 95%+ chunks entre 200-2000 chars)
    COUNT(kbc.id) FILTER (
      WHERE LENGTH(kbc.content) BETWEEN 200 AND 2000
    ) * 100.0 / NULLIF(COUNT(kbc.id), 0) as pct_good_chunks,

    -- Metadata Quality (objectif: 70%+ métadonnées avec confidence >= 0.75)
    COUNT(wpm.id) FILTER (
      WHERE wpm.extraction_confidence >= 0.75
    ) * 100.0 / NULLIF(COUNT(wpm.id), 0) as pct_confident_metadata,

    -- Totaux pour contexte
    COUNT(DISTINCT wp.id) as total_pages,
    COUNT(kbc.id) as total_chunks,
    COUNT(wpm.id) as total_metadata_extractions

  FROM web_pages wp
  LEFT JOIN web_sources ws ON wp.web_source_id = ws.id
  LEFT JOIN knowledge_base kb ON wp.id = kb.source_page_id
  LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id
  WHERE wp.is_indexed = true
)
SELECT
  -- Overall Health Score (0-100)
  ROUND(
    (COALESCE(pct_high_quality, 0) * 0.5) +
    (COALESCE(pct_good_chunks, 0) * 0.3) +
    (COALESCE(pct_confident_metadata, 0) * 0.2),
    1
  ) as overall_health_score,

  -- Détails par pilier
  ROUND(pct_high_quality, 1) as quality_pct,
  ROUND(pct_good_chunks, 1) as chunking_pct,
  ROUND(pct_confident_metadata, 1) as metadata_pct,

  -- Contexte
  total_pages,
  total_chunks,
  total_metadata_extractions,

  -- Status
  CASE
    WHEN ROUND(
      (COALESCE(pct_high_quality, 0) * 0.5) +
      (COALESCE(pct_good_chunks, 0) * 0.3) +
      (COALESCE(pct_confident_metadata, 0) * 0.2),
      1
    ) >= 85 THEN '✅ EXCELLENT'
    WHEN ROUND(
      (COALESCE(pct_high_quality, 0) * 0.5) +
      (COALESCE(pct_good_chunks, 0) * 0.3) +
      (COALESCE(pct_confident_metadata, 0) * 0.2),
      1
    ) >= 70 THEN '🟡 WARNING'
    ELSE '🔴 CRITICAL'
  END as health_status
FROM metrics;

-- ============================================================================
-- 6. RÉSUMÉ EXÉCUTIF
-- ============================================================================
-- Vue consolidée des métriques critiques pour décision rapide

WITH summary_stats AS (
  SELECT
    -- Pages indexées
    COUNT(DISTINCT wp.id) as total_indexed_pages,
    COUNT(DISTINCT wp.id) FILTER (WHERE wp.quality_score IS NULL) as pages_no_score,
    COUNT(DISTINCT wp.id) FILTER (WHERE wp.quality_score < 70) as pages_low_quality,

    -- Chunks
    COUNT(kbc.id) as total_chunks,
    COUNT(kbc.id) FILTER (WHERE LENGTH(kbc.content) < 200) as chunks_too_small,
    COUNT(kbc.id) FILTER (WHERE LENGTH(kbc.content) > 2000) as chunks_too_large,

    -- Métadonnées
    COUNT(DISTINCT wpm.id) as total_metadata_extractions,
    COUNT(DISTINCT wpm.id) FILTER (WHERE wpm.extraction_confidence < 0.75) as metadata_low_confidence,

    -- Embeddings
    COUNT(kbc.id) FILTER (
      WHERE kbc.embedding IS NOT NULL
      AND array_length(kbc.embedding::real[], 1) != 1024
    ) as embeddings_wrong_dimension

  FROM web_pages wp
  LEFT JOIN knowledge_base kb ON wp.id = kb.source_page_id
  LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
  LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id
  WHERE wp.is_indexed = true
)
SELECT
  total_indexed_pages,
  pages_no_score,
  ROUND(100.0 * pages_no_score / NULLIF(total_indexed_pages, 0), 1) as pct_no_score,
  pages_low_quality,
  ROUND(100.0 * pages_low_quality / NULLIF(total_indexed_pages, 0), 1) as pct_low_quality,

  total_chunks,
  chunks_too_small + chunks_too_large as chunks_problematic,
  ROUND(100.0 * (chunks_too_small + chunks_too_large) / NULLIF(total_chunks, 0), 1) as pct_chunks_problematic,

  total_metadata_extractions,
  metadata_low_confidence,
  ROUND(100.0 * metadata_low_confidence / NULLIF(total_metadata_extractions, 0), 1) as pct_metadata_low_conf,

  embeddings_wrong_dimension,

  -- Flags critiques
  CASE WHEN embeddings_wrong_dimension > 0 THEN '🔴 EMBEDDINGS CASSÉS' ELSE '✅' END as embedding_status,
  CASE WHEN 100.0 * pages_low_quality / NULLIF(total_indexed_pages, 0) > 10 THEN '🔴 QUALITÉ SOURCE' ELSE '✅' END as quality_status,
  CASE WHEN 100.0 * (chunks_too_small + chunks_too_large) / NULLIF(total_chunks, 0) > 5 THEN '🔴 CHUNKING' ELSE '✅' END as chunking_status,
  CASE WHEN 100.0 * metadata_low_confidence / NULLIF(total_metadata_extractions, 0) > 30 THEN '🟡 MÉTADONNÉES' ELSE '✅' END as metadata_status
FROM summary_stats;
