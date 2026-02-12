#!/usr/bin/env tsx
/**
 * Audit Qualité des Données RAG
 *
 * Exécute un audit complet des 3 piliers critiques :
 * 1. Qualité du contenu source (pages web + documents KB)
 * 2. Qualité du chunking (taille, distribution)
 * 3. Qualité des métadonnées (couverture, confiance)
 * 4. Validation embeddings (dimensions, couverture)
 *
 * Usage:
 *   npm run audit:rag               # Rapport console
 *   npm run audit:rag --export=json # Export JSON
 *   npm run audit:rag --export=csv  # Export CSV
 *
 * @author Claude Code
 * @date 2026-02-10
 */

import { Pool } from 'pg'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

interface PageAudit {
  id: string
  url: string
  quality_score: number | null
  word_count: number
  chunks_count: number
  source_name: string
  severity: 'CRITICAL' | 'WARNING' | 'OK'
}

interface SourceStats {
  source_id: string
  name: string
  category: string
  total_indexed: number
  avg_quality: number | null
  min_quality: number | null
  max_quality: number | null
  count_no_score: number
  count_auto_reject: number
  count_review: number
  count_excellent: number
  pct_excellent: number | null
}

interface ChunkIssue {
  issue_type: 'too_small' | 'too_large'
  chunk_count: number
  avg_chars: number
  avg_words: number
  doc_id: string
  title: string
  category: string
}

interface CategoryStats {
  category: string
  total_chunks: number
  avg_words: number | null
  min_words: number | null
  max_words: number | null
  stddev_words: number | null
  count_tiny: number
  count_normal: number
  count_huge: number
  pct_normal: number | null
}

interface MetadataAudit {
  id: string
  url: string
  title: string
  source_name: string
  document_type: string | null
  tribunal: string | null
  chambre: string | null
  extraction_confidence: number
  llm_provider: string
  confidence_level: 'CRITICAL' | 'WARNING' | 'OK'
}

interface CoverageStats {
  source_id: string
  name: string
  category: string
  total_pages: number
  pages_with_metadata: number
  coverage_pct: number | null
  avg_confidence: number | null
  has_tribunal: number
  has_chambre: number
  has_date: number
  has_numero: number
  coverage_status: 'CRITICAL' | 'WARNING' | 'OK'
}

interface EmbeddingValidation {
  table_name: string
  total_docs: number
  has_embedding: number
  correct_dim: number
  wrong_dim: number
  status: 'CRITICAL' | 'WARNING' | 'OK'
}

interface DuplicateEntry {
  url_hash: string
  duplicate_count: number
  page_ids: string[]
  urls: string[]
  source_names: string[]
}

interface AuditReport {
  timestamp: string
  summary: {
    totalIndexedPages: number
    totalIndexedDocs: number
    totalChunks: number
    overallHealthScore: number
    criticalIssuesCount: number
    warningsCount: number
  }
  sourceQuality: {
    lowQualityPages: PageAudit[]
    qualityBySource: SourceStats[]
    criticalIssues: string[]
    recommendations: string[]
  }
  chunkingAnalysis: {
    problemChunks: ChunkIssue[]
    sizeDistribution: CategoryStats[]
    criticalIssues: string[]
    recommendations: string[]
  }
  metadataQuality: {
    lowConfidenceExtractions: MetadataAudit[]
    coverageBySource: CoverageStats[]
    criticalIssues: string[]
    recommendations: string[]
  }
  embeddings: {
    validation: EmbeddingValidation[]
    duplicates: DuplicateEntry[]
    criticalIssues: string[]
  }
}

// ============================================================================
// Configuration
// ============================================================================

const THRESHOLDS = {
  QUALITY_CRITICAL: 70,
  QUALITY_EXCELLENT: 80,
  CHUNK_MIN_WORDS: 100,
  CHUNK_MAX_CHARS: 2000,
  CHUNK_PROBLEMATIC_PCT: 5,
  METADATA_CONFIDENCE_MIN: 0.75,
  METADATA_COVERAGE_MIN: 70,
  HEALTH_SCORE_EXCELLENT: 85,
  HEALTH_SCORE_WARNING: 70,
}

// ============================================================================
// Database Connection
// ============================================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fallback pour environnement local si DATABASE_URL non défini
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5433'),
  database: process.env.POSTGRES_DB || 'moncabinet',
  user: process.env.POSTGRES_USER || 'moncabinet',
  password: process.env.POSTGRES_PASSWORD || 'dev_password_change_in_production',
})

// ============================================================================
// SQL Queries
// ============================================================================

const QUERIES = {
  // A1 - Pages de faible qualité
  lowQualityPages: `
    SELECT
      wp.id,
      wp.url,
      wp.quality_score,
      wp.word_count,
      wp.chunks_count,
      ws.name as source_name,
      CASE
        WHEN wp.quality_score IS NULL THEN 'CRITICAL'
        WHEN wp.quality_score < 60 THEN 'CRITICAL'
        WHEN wp.quality_score < 70 THEN 'WARNING'
        ELSE 'OK'
      END as severity
    FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE wp.is_indexed = true
      AND (
        wp.quality_score < $1
        OR wp.word_count < 500
        OR wp.quality_score IS NULL
      )
    ORDER BY wp.quality_score ASC NULLS FIRST
    LIMIT 100
  `,

  // A2 - Distribution de qualité par source
  qualityBySource: `
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
    ORDER BY avg_quality ASC NULLS FIRST
  `,

  // B1 - Chunks problématiques
  problemChunks: `
    WITH chunk_issues AS (
      SELECT
        CASE
          WHEN LENGTH(kbc.content) < 200 THEN 'too_small'
          WHEN LENGTH(kbc.content) > $1 THEN 'too_large'
        END as issue_type,
        kbc.id as chunk_id,
        LENGTH(kbc.content) as size_chars,
        LENGTH(kbc.content) - LENGTH(REPLACE(kbc.content, ' ', '')) + 1 as size_words,
        kb.id as doc_id,
        kb.title,
        kb.category
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE LENGTH(kbc.content) < 200 OR LENGTH(kbc.content) > $1
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
    HAVING COUNT(*) > 2
    ORDER BY issue_type, chunk_count DESC
    LIMIT 50
  `,

  // B2 - Distribution de taille par catégorie
  sizeDistribution: `
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
      COUNT(*) FILTER (WHERE word_count < $1) as count_tiny,
      COUNT(*) FILTER (WHERE word_count BETWEEN $1 AND 800) as count_normal,
      COUNT(*) FILTER (WHERE word_count > 800) as count_huge,
      ROUND(100.0 * COUNT(*) FILTER (WHERE word_count BETWEEN $1 AND 800) / NULLIF(COUNT(*), 0), 1) as pct_normal
    FROM chunk_stats
    GROUP BY category
    ORDER BY avg_words DESC
  `,

  // C1 - Extractions de faible confiance
  lowConfidenceExtractions: `
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
        WHEN wpm.extraction_confidence < $1 THEN 'WARNING'
        ELSE 'OK'
      END as confidence_level
    FROM web_page_structured_metadata wpm
    JOIN web_pages wp ON wpm.web_page_id = wp.id
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE wpm.extraction_confidence < $1
      AND wp.is_indexed = true
    ORDER BY wpm.extraction_confidence ASC
    LIMIT 100
  `,

  // C2 - Couverture métadonnées par source
  coverageBySource: `
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
      COUNT(*) FILTER (WHERE wpm.decision_number IS NOT NULL) as has_numero,
      CASE
        WHEN ws.category = 'jurisprudence' AND COUNT(DISTINCT wpm.id) * 100.0 / NULLIF(COUNT(DISTINCT wp.id), 0) < 50 THEN 'CRITICAL'
        WHEN COUNT(DISTINCT wpm.id) * 100.0 / NULLIF(COUNT(DISTINCT wp.id), 0) < $1 THEN 'WARNING'
        ELSE 'OK'
      END as coverage_status
    FROM web_sources ws
    JOIN web_pages wp ON ws.id = wp.web_source_id
    LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id
    WHERE wp.is_indexed = true
    GROUP BY ws.id, ws.name, ws.category
    ORDER BY coverage_pct DESC
  `,

  // D1 - Validation dimensions embeddings
  embeddingValidation: `
    SELECT
      'knowledge_base' as table_name,
      COUNT(*) as total_docs,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding,
      COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
        AND array_length(embedding::real[], 1) = 1024
      ) as correct_dim,
      COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
        AND array_length(embedding::real[], 1) != 1024
      ) as wrong_dim,
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
        AND array_length(embedding::real[], 1) = 1024
      ) as correct_dim,
      COUNT(*) FILTER (
        WHERE embedding IS NOT NULL
        AND array_length(embedding::real[], 1) != 1024
      ) as wrong_dim,
      CASE
        WHEN COUNT(*) FILTER (
          WHERE embedding IS NOT NULL
          AND array_length(embedding::real[], 1) != 1024
        ) > 0 THEN 'CRITICAL'
        WHEN COUNT(*) FILTER (WHERE embedding IS NULL) > 0 THEN 'WARNING'
        ELSE 'OK'
      END as status
    FROM knowledge_base_chunks
  `,

  // D2 - Doublons d'URL
  duplicates: `
    SELECT
      wp.url_hash,
      COUNT(*) as duplicate_count,
      ARRAY_AGG(wp.id ORDER BY wp.last_crawled_at DESC) as page_ids,
      ARRAY_AGG(wp.url ORDER BY wp.last_crawled_at DESC) as urls,
      ARRAY_AGG(ws.name ORDER BY wp.last_crawled_at DESC) as source_names
    FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE wp.is_indexed = true
    GROUP BY wp.url_hash
    HAVING COUNT(*) > 1
    ORDER BY duplicate_count DESC
    LIMIT 50
  `,

  // Overall Health Score
  healthScore: `
    WITH metrics AS (
      SELECT
        COUNT(DISTINCT kb.id) FILTER (WHERE kb.quality_score >= $1) * 100.0 / NULLIF(COUNT(DISTINCT kb.id), 0) as pct_high_quality,
        COUNT(kbc.id) FILTER (
          WHERE LENGTH(kbc.content) BETWEEN 200 AND $2
        ) * 100.0 / NULLIF(COUNT(kbc.id), 0) as pct_good_chunks,
        COUNT(wpm.id) FILTER (
          WHERE wpm.extraction_confidence >= $3
        ) * 100.0 / NULLIF(COUNT(wpm.id), 0) as pct_confident_metadata,
        COUNT(DISTINCT wp.id) as total_pages,
        COUNT(DISTINCT kb.id) as total_docs,
        COUNT(kbc.id) as total_chunks,
        COUNT(wpm.id) as total_metadata_extractions
      FROM knowledge_base kb
      LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      LEFT JOIN web_pages wp ON kb.id = wp.knowledge_base_id
      LEFT JOIN web_page_structured_metadata wpm ON wp.id = wpm.web_page_id
      WHERE kb.is_indexed = true
    )
    SELECT
      ROUND(
        (COALESCE(pct_high_quality, 0) * 0.5) +
        (COALESCE(pct_good_chunks, 0) * 0.3) +
        (COALESCE(pct_confident_metadata, 0) * 0.2),
        1
      ) as overall_health_score,
      total_pages,
      total_docs,
      total_chunks,
      total_metadata_extractions
    FROM metrics
  `,

  // Compter documents KB
  kbCount: `
    SELECT COUNT(*) as total_docs
    FROM knowledge_base
    WHERE is_indexed = true
  `,

  // Compter chunks KB
  chunksCount: `
    SELECT COUNT(*) as total_chunks
    FROM knowledge_base_chunks
  `,
}

// ============================================================================
// Audit Functions
// ============================================================================

async function auditSourceQuality(): Promise<{
  lowQualityPages: PageAudit[]
  qualityBySource: SourceStats[]
  criticalIssues: string[]
  recommendations: string[]
}> {
  const lowQualityPages = await pool.query<PageAudit>(
    QUERIES.lowQualityPages,
    [THRESHOLDS.QUALITY_CRITICAL]
  )

  const qualityBySource = await pool.query<SourceStats>(QUERIES.qualityBySource)

  const criticalIssues: string[] = []
  const recommendations: string[] = []

  // Analyser les problèmes critiques
  const criticalCount = lowQualityPages.rows.filter((p) => p.severity === 'CRITICAL').length
  const totalPages = lowQualityPages.rows.length

  if (totalPages > 0 && criticalCount / totalPages > 0.1) {
    criticalIssues.push(
      `🔴 ${criticalCount} pages (${Math.round((criticalCount / totalPages) * 100)}%) avec qualité critique (score < 70 ou NULL)`
    )
    recommendations.push(
      '✅ Exécuter l\'analyse de qualité : POST /api/admin/kb/analyze-quality avec batchSize=10'
    )
  }

  for (const source of qualityBySource.rows) {
    if (source.avg_quality !== null && source.avg_quality < 65) {
      criticalIssues.push(
        `⚠️ Source "${source.name}" a une qualité moyenne de ${source.avg_quality}/100`
      )
      recommendations.push(
        `Vérifier EXTRACTION_CONFIGS dans content-extractor.ts pour ${source.name}`
      )
    }

    if (source.count_no_score > source.total_indexed * 0.2) {
      criticalIssues.push(
        `⚠️ Source "${source.name}" : ${source.count_no_score} pages sans score qualité (${Math.round((source.count_no_score / source.total_indexed) * 100)}%)`
      )
    }
  }

  return {
    lowQualityPages: lowQualityPages.rows,
    qualityBySource: qualityBySource.rows,
    criticalIssues,
    recommendations,
  }
}

async function auditChunking(): Promise<{
  problemChunks: ChunkIssue[]
  sizeDistribution: CategoryStats[]
  criticalIssues: string[]
  recommendations: string[]
}> {
  const problemChunks = await pool.query<ChunkIssue>(
    QUERIES.problemChunks,
    [THRESHOLDS.CHUNK_MAX_CHARS]
  )

  const sizeDistribution = await pool.query<CategoryStats>(
    QUERIES.sizeDistribution,
    [THRESHOLDS.CHUNK_MIN_WORDS]
  )

  const criticalIssues: string[] = []
  const recommendations: string[] = []

  // Analyser la distribution
  for (const category of sizeDistribution.rows) {
    const pctNormal = category.pct_normal ?? 0
    const stddevWords = category.stddev_words ?? 0
    const avgWords = category.avg_words ?? 0

    if (pctNormal < 95 - THRESHOLDS.CHUNK_PROBLEMATIC_PCT) {
      criticalIssues.push(
        `⚠️ Catégorie "${category.category}" : ${Math.round(100 - pctNormal)}% chunks hors plage normale (100-800 mots)`
      )
      recommendations.push(
        `Vérifier OVERLAP_BY_CATEGORY dans chunking-service.ts pour catégorie ${category.category}`
      )
    }

    if (stddevWords > 300) {
      criticalIssues.push(
        `⚠️ Catégorie "${category.category}" : variance élevée (stddev=${Math.round(stddevWords)} mots)`
      )
      recommendations.push(
        `Ajuster maxTokens dans chunking-service.ts pour ${category.category} (actuel: ${Math.round(avgWords)} mots)`
      )
    }
  }

  // Analyser les chunks problématiques
  const tooLarge = problemChunks.rows.filter((c) => c.issue_type === 'too_large')
  if (tooLarge.length > 0) {
    criticalIssues.push(
      `🔴 ${tooLarge.length} documents avec chunks trop grands (> ${THRESHOLDS.CHUNK_MAX_CHARS} chars)`
    )
    recommendations.push(
      'Re-chunker ces documents avec config corrigée (réduire maxTokens)'
    )
  }

  const tooSmall = problemChunks.rows.filter((c) => c.issue_type === 'too_small')
  if (tooSmall.length > 0) {
    criticalIssues.push(
      `🟡 ${tooSmall.length} documents avec chunks trop petits (< 200 chars)`
    )
    recommendations.push(
      'Ajouter filtrage MIN_CHUNK_WORDS=100 dans chunking-service.ts'
    )
  }

  return {
    problemChunks: problemChunks.rows,
    sizeDistribution: sizeDistribution.rows,
    criticalIssues,
    recommendations,
  }
}

async function auditMetadata(): Promise<{
  lowConfidenceExtractions: MetadataAudit[]
  coverageBySource: CoverageStats[]
  criticalIssues: string[]
  recommendations: string[]
}> {
  const lowConfidenceExtractions = await pool.query<MetadataAudit>(
    QUERIES.lowConfidenceExtractions,
    [THRESHOLDS.METADATA_CONFIDENCE_MIN]
  )

  const coverageBySource = await pool.query<CoverageStats>(
    QUERIES.coverageBySource,
    [THRESHOLDS.METADATA_COVERAGE_MIN]
  )

  const criticalIssues: string[] = []
  const recommendations: string[] = []

  // Analyser couverture par source
  for (const source of coverageBySource.rows) {
    if (source.coverage_status === 'CRITICAL') {
      criticalIssues.push(
        `🔴 Source "${source.name}" (${source.category}) : couverture métadonnées ${source.coverage_pct}% (< 50%)`
      )
      recommendations.push(
        `Améliorer règles d'extraction dans metadata-extractor-service.ts pour ${source.name}`
      )
    }

    if (source.avg_confidence !== null && Number(source.avg_confidence) < 0.7) {
      criticalIssues.push(
        `🟡 Source "${source.name}" : confiance moyenne ${Number(source.avg_confidence).toFixed(2)} (< 0.70)`
      )
      recommendations.push(
        `Re-extraire métadonnées avec prompts améliorés pour ${source.name}`
      )
    }
  }

  return {
    lowConfidenceExtractions: lowConfidenceExtractions.rows,
    coverageBySource: coverageBySource.rows,
    criticalIssues,
    recommendations,
  }
}

async function auditEmbeddings(): Promise<{
  validation: EmbeddingValidation[]
  duplicates: DuplicateEntry[]
  criticalIssues: string[]
}> {
  const validation = await pool.query<EmbeddingValidation>(QUERIES.embeddingValidation)
  const duplicates = await pool.query<DuplicateEntry>(QUERIES.duplicates)

  const criticalIssues: string[] = []

  // Vérifier dimensions incorrectes
  for (const row of validation.rows) {
    if (row.wrong_dim > 0) {
      criticalIssues.push(
        `🔴 BLOQUANT - ${row.table_name} : ${row.wrong_dim} embeddings avec dimension incorrecte (≠ 1024)`
      )
    }
  }

  // Signaler doublons
  if (duplicates.rows.length > 0) {
    criticalIssues.push(
      `🟡 ${duplicates.rows.length} groupes de pages dupliquées (même url_hash)`
    )
  }

  return {
    validation: validation.rows,
    duplicates: duplicates.rows,
    criticalIssues,
  }
}

async function calculateHealthScore(): Promise<{
  score: number
  totalPages: number
  totalDocs: number
  totalChunks: number
}> {
  const result = await pool.query(QUERIES.healthScore, [
    THRESHOLDS.QUALITY_EXCELLENT, // pct_high_quality
    THRESHOLDS.CHUNK_MAX_CHARS, // pct_good_chunks
    THRESHOLDS.METADATA_CONFIDENCE_MIN, // pct_confident_metadata
  ])

  const kbCount = await pool.query(QUERIES.kbCount)
  const chunksCount = await pool.query(QUERIES.chunksCount)

  const row = result.rows[0]
  return {
    score: parseFloat(row.overall_health_score) || 0,
    totalPages: parseInt(row.total_pages) || 0,
    totalDocs: parseInt(kbCount.rows[0]?.total_docs) || 0,
    totalChunks: parseInt(chunksCount.rows[0]?.total_chunks) || 0,
  }
}

// ============================================================================
// Main Audit Function
// ============================================================================

async function runAudit(): Promise<AuditReport> {
  console.log('🔍 Démarrage de l\'audit qualité RAG...\n')

  console.log('📊 Calcul du Health Score global...')
  const healthData = await calculateHealthScore()

  console.log('1️⃣  Audit de la qualité des sources...')
  const sourceQuality = await auditSourceQuality()

  console.log('2️⃣  Audit du chunking...')
  const chunkingAnalysis = await auditChunking()

  console.log('3️⃣  Audit des métadonnées...')
  const metadataQuality = await auditMetadata()

  console.log('4️⃣  Validation des embeddings...')
  const embeddings = await auditEmbeddings()

  // Compter les issues critiques
  const allCriticalIssues = [
    ...sourceQuality.criticalIssues,
    ...chunkingAnalysis.criticalIssues,
    ...metadataQuality.criticalIssues,
    ...embeddings.criticalIssues,
  ]

  const criticalCount = allCriticalIssues.filter((i) => i.startsWith('🔴')).length
  const warningCount = allCriticalIssues.filter((i) => i.startsWith('🟡')).length

  const report: AuditReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalIndexedPages: healthData.totalPages,
      totalIndexedDocs: healthData.totalDocs,
      totalChunks: healthData.totalChunks,
      overallHealthScore: healthData.score,
      criticalIssuesCount: criticalCount,
      warningsCount: warningCount,
    },
    sourceQuality,
    chunkingAnalysis,
    metadataQuality,
    embeddings,
  }

  console.log('\n✅ Audit terminé !\n')

  return report
}

// ============================================================================
// Display Functions
// ============================================================================

function displayReport(report: AuditReport) {
  console.log('═'.repeat(80))
  console.log('           RAPPORT D\'AUDIT QUALITÉ RAG - RÉSUMÉ EXÉCUTIF')
  console.log('═'.repeat(80))
  console.log()

  // Summary
  const { summary } = report
  const healthStatus =
    summary.overallHealthScore >= THRESHOLDS.HEALTH_SCORE_EXCELLENT
      ? '✅ EXCELLENT'
      : summary.overallHealthScore >= THRESHOLDS.HEALTH_SCORE_WARNING
      ? '🟡 WARNING'
      : '🔴 CRITICAL'

  console.log(`📊 Overall Health Score: ${summary.overallHealthScore}/100 ${healthStatus}`)
  console.log(`📄 Pages indexées: ${summary.totalIndexedPages}`)
  console.log(`📚 Documents indexés: ${summary.totalIndexedDocs}`)
  console.log(`📝 Chunks totaux: ${summary.totalChunks}`)
  console.log(`🔴 Issues critiques: ${summary.criticalIssuesCount}`)
  console.log(`🟡 Warnings: ${summary.warningsCount}`)
  console.log()

  // Critical Issues
  if (summary.criticalIssuesCount > 0 || summary.warningsCount > 0) {
    console.log('─'.repeat(80))
    console.log('🚨 PROBLÈMES IDENTIFIÉS')
    console.log('─'.repeat(80))
    console.log()

    const allIssues = [
      ...report.sourceQuality.criticalIssues,
      ...report.chunkingAnalysis.criticalIssues,
      ...report.metadataQuality.criticalIssues,
      ...report.embeddings.criticalIssues,
    ]

    allIssues.forEach((issue) => console.log(`   ${issue}`))
    console.log()
  }

  // Recommendations
  const allRecommendations = [
    ...report.sourceQuality.recommendations,
    ...report.chunkingAnalysis.recommendations,
    ...report.metadataQuality.recommendations,
  ]

  if (allRecommendations.length > 0) {
    console.log('─'.repeat(80))
    console.log('💡 RECOMMANDATIONS')
    console.log('─'.repeat(80))
    console.log()

    allRecommendations.forEach((rec, idx) =>
      console.log(`   ${idx + 1}. ${rec}`)
    )
    console.log()
  }

  // Chunking Distribution
  console.log('─'.repeat(80))
  console.log('📊 DISTRIBUTION DES CHUNKS PAR CATÉGORIE')
  console.log('─'.repeat(80))
  console.log()

  report.chunkingAnalysis.sizeDistribution.forEach((cat) => {
    const pctNormal = cat.pct_normal ?? 0
    const avgWords = Math.round(cat.avg_words ?? 0)
    const status = pctNormal >= 95 - THRESHOLDS.CHUNK_PROBLEMATIC_PCT ? '✅' : '⚠️'
    console.log(
      `   ${status} ${cat.category.padEnd(20)} : ${cat.total_chunks} chunks, ` +
        `${avgWords} mots moy. (${pctNormal.toFixed(1)}% normal)`
    )
  })
  console.log()

  // Embeddings
  console.log('─'.repeat(80))
  console.log('🔢 VALIDATION DES EMBEDDINGS')
  console.log('─'.repeat(80))
  console.log()

  report.embeddings.validation.forEach((val) => {
    const status = val.status === 'OK' ? '✅' : val.status === 'WARNING' ? '🟡' : '🔴'
    console.log(
      `   ${status} ${val.table_name.padEnd(25)} : ` +
        `${val.correct_dim}/${val.has_embedding} correct (dim=1024), ` +
        `${val.wrong_dim} incorrect`
    )
  })
  console.log()

  console.log('═'.repeat(80))
  console.log(
    `   📅 Rapport généré le : ${new Date(report.timestamp).toLocaleString('fr-FR')}`
  )
  console.log('═'.repeat(80))
}

// ============================================================================
// Export Functions
// ============================================================================

function exportJSON(report: AuditReport, outputPath?: string) {
  const filename =
    outputPath || `audit-rag-${new Date().toISOString().split('T')[0]}.json`
  fs.writeFileSync(filename, JSON.stringify(report, null, 2))
  console.log(`\n✅ Rapport exporté en JSON : ${filename}`)
}

function exportCSV(report: AuditReport, outputPath?: string) {
  const baseName =
    outputPath || `audit-rag-${new Date().toISOString().split('T')[0]}`

  // Summary CSV
  const summaryCSV = [
    'metric,value',
    `overall_health_score,${report.summary.overallHealthScore}`,
    `total_indexed_pages,${report.summary.totalIndexedPages}`,
    `total_indexed_docs,${report.summary.totalIndexedDocs}`,
    `total_chunks,${report.summary.totalChunks}`,
    `critical_issues,${report.summary.criticalIssuesCount}`,
    `warnings,${report.summary.warningsCount}`,
  ].join('\n')

  fs.writeFileSync(`${baseName}-summary.csv`, summaryCSV)

  // Chunking Distribution CSV
  const chunkingCSV = [
    'category,total_chunks,avg_words,min_words,max_words,stddev_words,count_tiny,count_normal,count_huge,pct_normal',
    ...report.chunkingAnalysis.sizeDistribution.map(
      (c) =>
        `${c.category},${c.total_chunks},${c.avg_words ?? ''},${c.min_words ?? ''},${c.max_words ?? ''},${c.stddev_words ?? ''},${c.count_tiny},${c.count_normal},${c.count_huge},${c.pct_normal ?? ''}`
    ),
  ].join('\n')

  fs.writeFileSync(`${baseName}-chunking.csv`, chunkingCSV)

  console.log(`\n✅ Rapports exportés en CSV :`)
  console.log(`   - ${baseName}-summary.csv`)
  console.log(`   - ${baseName}-chunking.csv`)
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2)
  const exportFormat = args.find((arg) => arg.startsWith('--export='))?.split('=')[1]
  const outputPath = args.find((arg) => arg.startsWith('--output='))?.split('=')[1]

  try {
    const report = await runAudit()

    // Display report
    displayReport(report)

    // Export if requested
    if (exportFormat === 'json') {
      exportJSON(report, outputPath)
    } else if (exportFormat === 'csv') {
      exportCSV(report, outputPath)
    }

    await pool.end()
    process.exit(0)
  } catch (error) {
    console.error('\n🔴 Erreur lors de l\'audit :', error)
    await pool.end()
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

export { runAudit, displayReport, exportJSON, exportCSV }
export type { AuditReport }
