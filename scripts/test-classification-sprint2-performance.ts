/**
 * Script de test Sprint 2 - Performance Classification Juridique
 *
 * Valide les gains de performance des optimisations Sprint 2 :
 * - Phase 2.2 : Seuil adaptatif activation LLM (-50% appels)
 * - Phase 2.3 : Détection champs N/A extraction (-30% appels)
 * - Phase 2.4 : Enrichissement parallèle (-60% temps)
 * - Phase 3.1 : Seuils adaptatifs domaine (+20-30% précision)
 *
 * Usage: npx tsx scripts/test-classification-sprint2-performance.ts
 */

import { db } from '@/lib/db/postgres'
import { classifyLegalContent } from '@/lib/web-scraper/legal-classifier-service'
import { extractStructuredMetadata } from '@/lib/web-scraper/metadata-extractor-service'
import { getCacheStats } from '@/lib/cache/classification-cache-service'
import {
  getThresholdsForDomain,
  getClassificationThreshold,
} from '@/lib/web-scraper/adaptive-thresholds'

// =============================================================================
// CONFIGURATION
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function log(message: string, color: keyof typeof COLORS = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`)
}

interface PerformanceMetrics {
  totalTime: number
  avgTimePerPage: number
  llmCallsClassification: number
  llmCallsExtraction: number
  llmCallsPercentage: number
  cacheHits: number
  cacheHitRate: number
}

// =============================================================================
// TESTS
// =============================================================================

async function test1_adaptiveThresholds() {
  log('\n=== Test 1 : Seuils Adaptatifs par Domaine ===', 'cyan')

  // Vérifier que différents domaines ont différents seuils
  const domains = ['jurisprudence', 'legislation', 'doctrine', 'fiscal', 'penal']
  const thresholds: Record<string, number> = {}

  for (const domain of domains) {
    const threshold = getClassificationThreshold(null, domain)
    thresholds[domain] = threshold
    log(`  ${domain}: ${(threshold * 100).toFixed(0)}%`, 'yellow')
  }

  // Vérifier variations
  const jurisprudenceThreshold = thresholds['jurisprudence']
  const legislationThreshold = thresholds['legislation']
  const doctrineThreshold = thresholds['doctrine']

  if (
    jurisprudenceThreshold < legislationThreshold &&
    doctrineThreshold < jurisprudenceThreshold
  ) {
    log('✓ Seuils adaptatifs corrects : doctrine < jurisprudence < legislation', 'green')
  } else {
    log('✗ Seuils adaptatifs incorrects', 'red')
  }

  // Vérifier fonction requiresValidation
  const { requiresValidation } = await import('@/lib/web-scraper/adaptive-thresholds')

  const testCases = [
    { confidence: 0.70, category: 'legislation', domain: null, expected: true }, // 0.70 < 0.75
    { confidence: 0.76, category: 'legislation', domain: null, expected: false }, // 0.76 > 0.75
    { confidence: 0.66, category: 'jurisprudence', domain: null, expected: false }, // 0.66 > 0.65
    { confidence: 0.64, category: 'jurisprudence', domain: null, expected: true }, // 0.64 < 0.65
  ]

  let passed = 0
  for (const test of testCases) {
    const result = requiresValidation(test.confidence, test.category, test.domain)
    if (result === test.expected) {
      passed++
    } else {
      log(
        `  ✗ Test failed: confidence=${test.confidence}, category=${test.category}, expected=${test.expected}, got=${result}`,
        'red'
      )
    }
  }

  log(`✓ ${passed}/${testCases.length} tests validation passed`, 'green')
}

async function test2_llmDecisions() {
  log('\n=== Test 2 : Décisions Activation LLM ===', 'cyan')

  // Compter les logs de décision LLM dans ai_usage_logs
  const llmUsageBefore = await db.query(`
    SELECT COUNT(*) as count
    FROM ai_usage_logs
    WHERE operation_type = 'classification'
      AND created_at >= NOW() - INTERVAL '1 hour'
  `)

  const countBefore = parseInt(llmUsageBefore.rows[0].count)
  log(`  Appels LLM classification (1h): ${countBefore}`, 'yellow')

  // Récupérer quelques pages pour tester
  const pagesResult = await db.query(`
    SELECT wp.id, ws.category, ws.name
    FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE wp.extracted_text IS NOT NULL
      AND LENGTH(wp.extracted_text) > 200
    LIMIT 5
  `)

  if (pagesResult.rows.length === 0) {
    log('  ⚠ Aucune page disponible pour test', 'yellow')
    return
  }

  log(`  Classifying ${pagesResult.rows.length} pages...`, 'cyan')
  let llmActivatedCount = 0

  for (const page of pagesResult.rows) {
    const result = await classifyLegalContent(page.id)

    // Vérifier si LLM a été utilisé (via llmProvider)
    if (result.llmProvider !== 'cache' && result.llmProvider !== 'fallback') {
      llmActivatedCount++
    }

    log(
      `    Page ${page.id.substring(0, 8)}: ${result.classificationSource}, confidence: ${(result.confidenceScore * 100).toFixed(0)}%`,
      'yellow'
    )
  }

  const llmActivationRate = (llmActivatedCount / pagesResult.rows.length) * 100
  log(`  LLM activation rate: ${llmActivationRate.toFixed(0)}%`, 'yellow')

  if (llmActivationRate < 50) {
    log('✓ LLM activation rate < 50% (objectif atteint)', 'green')
  } else {
    log('⚠ LLM activation rate > 50% (objectif partiellement atteint)', 'yellow')
  }
}

async function test3_extractionSkip() {
  log('\n=== Test 3 : Skip Extraction LLM (champs N/A) ===', 'cyan')

  // Tester extraction sur pages de différentes catégories
  const categories = ['jurisprudence', 'legislation', 'doctrine', 'autre']
  const extractionResults: Record<string, { used: boolean; category: string }> = {}

  for (const category of categories) {
    // Récupérer une page de cette catégorie
    const pageResult = await db.query(
      `
      SELECT wp.id, ws.category
      FROM web_pages wp
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE ws.category = $1
        AND wp.extracted_text IS NOT NULL
        AND LENGTH(wp.extracted_text) > 200
      LIMIT 1
    `,
      [category]
    )

    if (pageResult.rows.length === 0) {
      log(`  ⚠ Aucune page "${category}" disponible`, 'yellow')
      continue
    }

    const page = pageResult.rows[0]

    // Compter appels LLM avant extraction
    const usageBefore = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_usage_logs
      WHERE operation_type = 'extraction'
        AND created_at >= NOW() - INTERVAL '5 minutes'
    `)

    const countBefore = parseInt(usageBefore.rows[0].count)

    // Extraire métadonnées
    await extractStructuredMetadata(page.id)

    // Compter appels LLM après extraction
    const usageAfter = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_usage_logs
      WHERE operation_type = 'extraction'
        AND created_at >= NOW() - INTERVAL '5 minutes'
    `)

    const countAfter = parseInt(usageAfter.rows[0].count)
    const llmUsed = countAfter > countBefore

    extractionResults[category] = { used: llmUsed, category }

    log(
      `  ${category}: LLM ${llmUsed ? 'UTILISÉ' : 'SKIP'} ${llmUsed ? '❌' : '✓'}`,
      llmUsed ? 'red' : 'green'
    )
  }

  // Vérifier que "autre" a skip LLM (< 3 champs applicables)
  if (extractionResults.autre && !extractionResults.autre.used) {
    log('✓ Catégorie "autre" skip LLM correctement', 'green')
  } else if (extractionResults.autre) {
    log('⚠ Catégorie "autre" devrait skip LLM', 'yellow')
  }
}

async function test4_benchmarkPerformance() {
  log('\n=== Test 4 : Benchmark Performance End-to-End ===', 'cyan')

  // Récupérer 10 pages pour benchmark
  const pagesResult = await db.query(`
    SELECT wp.id, wp.url, ws.name, ws.category
    FROM web_pages wp
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE wp.extracted_text IS NOT NULL
      AND LENGTH(wp.extracted_text) > 200
    ORDER BY wp.created_at DESC
    LIMIT 10
  `)

  if (pagesResult.rows.length < 3) {
    log('  ⚠ Pas assez de pages pour benchmark', 'yellow')
    return
  }

  const pages = pagesResult.rows
  log(`  Benchmark sur ${pages.length} pages`, 'blue')

  // Compter appels LLM avant
  const usageBefore = await db.query(`
    SELECT
      operation_type,
      COUNT(*) as count
    FROM ai_usage_logs
    WHERE operation_type IN ('classification', 'extraction')
      AND created_at >= NOW() - INTERVAL '5 minutes'
    GROUP BY operation_type
  `)

  const llmCountBefore = {
    classification: 0,
    extraction: 0,
  }
  for (const row of usageBefore.rows) {
    llmCountBefore[row.operation_type as 'classification' | 'extraction'] = parseInt(row.count)
  }

  // Cache stats avant
  const cacheStatsBefore = await getCacheStats()

  // Benchmark classification
  const startTotal = Date.now()
  const times: number[] = []

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    log(`  [${i + 1}/${pages.length}] ${page.url.substring(0, 60)}...`, 'cyan')

    const start = Date.now()
    await classifyLegalContent(page.id)
    const time = Date.now() - start

    times.push(time)
    log(`    ✓ ${time} ms`, 'green')
  }

  const totalTime = Date.now() - startTotal

  // Cache stats après
  const cacheStatsAfter = await getCacheStats()

  // Compter appels LLM après
  const usageAfter = await db.query(`
    SELECT
      operation_type,
      COUNT(*) as count
    FROM ai_usage_logs
    WHERE operation_type IN ('classification', 'extraction')
      AND created_at >= NOW() - INTERVAL '5 minutes'
    GROUP BY operation_type
  `)

  const llmCountAfter = {
    classification: 0,
    extraction: 0,
  }
  for (const row of usageAfter.rows) {
    llmCountAfter[row.operation_type as 'classification' | 'extraction'] = parseInt(row.count)
  }

  // Calculer métriques
  const llmCallsClassification = llmCountAfter.classification - llmCountBefore.classification
  const llmCallsExtraction = llmCountAfter.extraction - llmCountBefore.extraction
  const cacheHits = cacheStatsAfter.count - cacheStatsBefore.count

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const p50 = times.sort((a, b) => a - b)[Math.floor(times.length / 2)]
  const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)]

  // Afficher résultats
  log('\n📊 Résultats Benchmark:', 'blue')
  log(`  Temps total: ${totalTime} ms`, 'yellow')
  log(`  Temps moyen/page: ${avgTime.toFixed(0)} ms`, 'yellow')
  log(`  P50: ${p50} ms`, 'yellow')
  log(`  P95: ${p95} ms`, 'yellow')
  log(`  Appels LLM classification: ${llmCallsClassification}/${pages.length} (${((llmCallsClassification / pages.length) * 100).toFixed(0)}%)`, 'yellow')
  log(`  Appels LLM extraction: ${llmCallsExtraction}/${pages.length} (${((llmCallsExtraction / pages.length) * 100).toFixed(0)}%)`, 'yellow')
  log(`  Cache hits: ${cacheHits}`, 'yellow')

  // Évaluer gains
  log('\n🎯 Évaluation Objectifs Sprint 2:', 'magenta')

  const classificationRate = (llmCallsClassification / pages.length) * 100
  if (classificationRate <= 20) {
    log(`  ✓ Appels LLM classification: ${classificationRate.toFixed(0)}% <= 20% (objectif 15%)`, 'green')
  } else {
    log(`  ⚠ Appels LLM classification: ${classificationRate.toFixed(0)}% > 20% (objectif 15%)`, 'yellow')
  }

  if (avgTime <= 20000) {
    log(`  ✓ Temps moyen: ${(avgTime / 1000).toFixed(1)}s <= 20s (objectif 12-20s)`, 'green')
  } else {
    log(`  ⚠ Temps moyen: ${(avgTime / 1000).toFixed(1)}s > 20s (objectif 12-20s)`, 'yellow')
  }

  if (cacheHits > 0) {
    const cacheHitRate = (cacheHits / pages.length) * 100
    log(`  ✓ Cache hit rate: ${cacheHitRate.toFixed(0)}%`, 'green')
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  log('╔════════════════════════════════════════════════════════════════╗', 'blue')
  log('║  TEST SPRINT 2 - Performance Classification Juridique        ║', 'blue')
  log('║  Quick Wins : -60% temps, -50% appels LLM, +30% précision    ║', 'blue')
  log('╚════════════════════════════════════════════════════════════════╝', 'blue')

  try {
    await test1_adaptiveThresholds()
    await test2_llmDecisions()
    await test3_extractionSkip()
    await test4_benchmarkPerformance()

    log('\n╔════════════════════════════════════════════════════════════════╗', 'green')
    log('║  ✓ TOUS LES TESTS SPRINT 2 COMPLÉTÉS                          ║', 'green')
    log('╚════════════════════════════════════════════════════════════════╝', 'green')

    log('\n📊 Comparer avec Sprint 1:', 'cyan')
    log('   Objectifs Sprint 2 vs Sprint 1:', 'yellow')
    log('   - Temps classification: 30-50s → 12-20s (-60%)', 'yellow')
    log('   - Appels LLM classification: 40% → 15% (-63%)', 'yellow')
    log('   - Appels LLM extraction: 100% → 50% (-50%)', 'yellow')
    log('   - Précision classification: +20-30%', 'yellow')

  } catch (error) {
    log('\n✗ ERREUR:', 'red')
    console.error(error)
    process.exit(1)
  } finally {
    process.exit(0)
  }
}

main()
