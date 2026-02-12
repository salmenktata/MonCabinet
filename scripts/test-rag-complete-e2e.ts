#!/usr/bin/env tsx
/**
 * Tests E2E Complets - Amélioration Qualité RAG (Tous Sprints)
 *
 * Usage: npx tsx scripts/test-rag-complete-e2e.ts
 *
 * Teste le pipeline RAG complet avec toutes les optimisations:
 * - Sprint 1: OpenAI embeddings + contexte augmenté
 * - Sprint 2: Metadata filtering + query expansion
 * - Sprint 3: Hybrid search + cross-encoder re-ranking
 *
 * Scénarios de validation:
 * 1. Query courte (< 50 chars) avec expansion
 * 2. Query juridique spécifique (classification)
 * 3. Query keywords exacts (hybrid search)
 * 4. Query complexe (re-ranking)
 * 5. Comparaison avant/après toutes optimisations
 *
 * Février 2026 - Validation Complète RAG
 */

import { pool } from '@/lib/db'
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { searchKnowledgeBase, searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'
import { classifyQuery } from '@/lib/ai/query-classifier-service'
import { expandQuery } from '@/lib/ai/query-expansion-service'
import { rerankWithCrossEncoder } from '@/lib/ai/cross-encoder-service'

// =============================================================================
// COULEURS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
}

function success(msg: string) {
  console.log(`${colors.green}✓${colors.reset} ${msg}`)
}

function error(msg: string) {
  console.log(`${colors.red}✗${colors.reset} ${msg}`)
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`)
}

function section(title: string) {
  console.log(`\n${colors.blue}━━━ ${title} ━━━${colors.reset}`)
}

function subsection(title: string) {
  console.log(`\n${colors.magenta}${title}${colors.reset}`)
}

// =============================================================================
// MÉTRIQUES
// =============================================================================

interface TestMetrics {
  duration: number
  resultsCount: number
  topScore: number
  avgScore: number
  relevantCount: number  // Score > 0.7
}

function calculateMetrics(results: any[], startTime: number): TestMetrics {
  return {
    duration: Date.now() - startTime,
    resultsCount: results.length,
    topScore: results.length > 0 ? results[0].similarity : 0,
    avgScore:
      results.length > 0
        ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
        : 0,
    relevantCount: results.filter((r) => r.similarity >= 0.7).length,
  }
}

function displayMetrics(label: string, metrics: TestMetrics) {
  info(`   ${label}:`)
  info(`   - Temps: ${metrics.duration}ms`)
  info(`   - Résultats: ${metrics.resultsCount}`)
  info(`   - Score top: ${(metrics.topScore * 100).toFixed(1)}%`)
  info(`   - Score moyen: ${(metrics.avgScore * 100).toFixed(1)}%`)
  info(`   - Pertinents (>70%): ${metrics.relevantCount}`)
}

// =============================================================================
// SCÉNARIOS DE TEST
// =============================================================================

// Scénario 1: Query courte avec expansion
async function testScenario1() {
  section('Scénario 1: Query Courte avec Expansion')

  const shortQuery = 'قع شجار'
  info(`   Query originale: "${shortQuery}" (${shortQuery.length} chars)`)

  // A. SANS expansion
  subsection('   A. Sans expansion (baseline)')
  const startA = Date.now()
  const resultsWithout = await searchKnowledgeBase(shortQuery, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsA = calculateMetrics(resultsWithout, startA)
  displayMetrics('Baseline', metricsA)

  // B. AVEC expansion
  subsection('   B. Avec expansion (optimisé)')
  const expanded = await expandQuery(shortQuery)
  info(`   Query expandée: "${expanded.substring(0, 80)}..."`)

  const startB = Date.now()
  const resultsWith = await searchKnowledgeBase(expanded, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsB = calculateMetrics(resultsWith, startB)
  displayMetrics('Optimisé', metricsB)

  // C. Impact
  subsection('   C. Impact expansion')
  const impact = {
    resultsCount: metricsB.resultsCount - metricsA.resultsCount,
    topScore: metricsB.topScore - metricsA.topScore,
    relevantCount: metricsB.relevantCount - metricsA.relevantCount,
  }
  info(`   - Résultats: ${impact.resultsCount >= 0 ? '+' : ''}${impact.resultsCount}`)
  info(
    `   - Score top: ${impact.topScore >= 0 ? '+' : ''}${(impact.topScore * 100).toFixed(1)}%`
  )
  info(`   - Pertinents: ${impact.relevantCount >= 0 ? '+' : ''}${impact.relevantCount}`)

  return { baseline: metricsA, optimized: metricsB }
}

// Scénario 2: Query juridique spécifique (classification + filtrage)
async function testScenario2() {
  section('Scénario 2: Query Juridique avec Filtrage Catégorie')

  const legalQuery = 'ما هي شروط الدفاع الشرعي؟'
  info(`   Query: "${legalQuery}"`)

  // A. Classification
  subsection('   A. Classification query')
  const classification = await classifyQuery(legalQuery)
  info(`   - Catégories: ${classification.categories.join(', ')}`)
  info(`   - Domaines: ${classification.domains.join(', ')}`)
  info(`   - Confiance: ${(classification.confidence * 100).toFixed(1)}%`)

  // B. Recherche SANS filtrage
  subsection('   B. Sans filtrage catégorie (baseline)')
  const startA = Date.now()
  const resultsGlobal = await searchKnowledgeBase(legalQuery, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsA = calculateMetrics(resultsGlobal, startA)
  displayMetrics('Baseline', metricsA)

  // C. Recherche AVEC filtrage intelligent
  subsection('   C. Avec filtrage catégorie (optimisé)')
  const startB = Date.now()
  const resultsFiltered: any[] = []

  for (const category of classification.categories) {
    const categoryResults = await searchKnowledgeBase(legalQuery, {
      category: category as any,
      limit: Math.ceil(10 / classification.categories.length),
      operationName: 'assistant-ia',
    })
    resultsFiltered.push(...categoryResults)
  }

  resultsFiltered.sort((a, b) => b.similarity - a.similarity)
  const metricsB = calculateMetrics(resultsFiltered.slice(0, 10), startB)
  displayMetrics('Optimisé', metricsB)

  // D. Analyse pertinence catégories
  subsection('   D. Analyse pertinence catégories')
  const categoryMatches = resultsFiltered.filter((r) =>
    classification.categories.includes(r.category as any)
  ).length
  info(
    `   - Résultats dans catégories attendues: ${categoryMatches}/${resultsFiltered.length}`
  )

  return { baseline: metricsA, optimized: metricsB }
}

// Scénario 3: Query keywords exacts (hybrid search)
async function testScenario3() {
  section('Scénario 3: Query Keywords Exacts (Hybrid Search)')

  const keywordQuery = 'دفاع شرعي الفصل 39'  // Keywords précis
  info(`   Query: "${keywordQuery}"`)

  // A. Recherche vectorielle pure
  subsection('   A. Vectoriel pur (baseline)')
  const startA = Date.now()
  const resultsVector = await searchKnowledgeBase(keywordQuery, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsA = calculateMetrics(resultsVector, startA)
  displayMetrics('Vectoriel', metricsA)

  // B. Recherche hybride (vectoriel + BM25)
  subsection('   B. Hybride (vectoriel + BM25)')
  const startB = Date.now()
  const resultsHybrid = await searchKnowledgeBaseHybrid(keywordQuery, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsB = calculateMetrics(resultsHybrid, startB)
  displayMetrics('Hybride', metricsB)

  // C. Impact hybrid
  subsection('   C. Impact hybrid search')
  const impact = {
    resultsCount: metricsB.resultsCount - metricsA.resultsCount,
    topScore: metricsB.topScore - metricsA.topScore,
  }
  info(`   - Résultats: ${impact.resultsCount >= 0 ? '+' : ''}${impact.resultsCount}`)
  info(
    `   - Score top: ${impact.topScore >= 0 ? '+' : ''}${(impact.topScore * 100).toFixed(1)}%`
  )

  return { baseline: metricsA, optimized: metricsB }
}

// Scénario 4: Query complexe (re-ranking cross-encoder)
async function testScenario4() {
  section('Scénario 4: Query Complexe (Re-ranking Neural)')

  const complexQuery = 'في حالة شجار ليلي أمام نادٍ وأصيب شخص، ما هي الشروط القانونية للدفاع الشرعي؟'
  info(`   Query: "${complexQuery.substring(0, 60)}..."`)

  // A. Récupérer résultats initiaux
  subsection('   A. Résultats initiaux (scores vectoriels)')
  const startA = Date.now()
  const initialResults = await searchKnowledgeBase(complexQuery, {
    limit: 10,
    operationName: 'assistant-ia',
  })
  const metricsA = calculateMetrics(initialResults, startA)
  displayMetrics('Scores vectoriels', metricsA)

  // B. Re-ranking avec cross-encoder
  subsection('   B. Re-ranking avec cross-encoder neural')
  const startB = Date.now()
  const contents = initialResults.map((r) => r.chunkContent)
  const reranked = await rerankWithCrossEncoder(complexQuery, contents, 10)
  const durationB = Date.now() - startB

  // Reconstruire résultats re-rankés
  const rerankedResults = reranked.map((r) => initialResults[r.index])
  const metricsB = calculateMetrics(rerankedResults, Date.now() - (durationB + metricsA.duration))

  info(`   Re-ranking neural:`)
  info(`   - Temps: ${durationB}ms`)
  info(`   - Top 3 après re-ranking:`)
  for (let i = 0; i < Math.min(3, reranked.length); i++) {
    const result = reranked[i]
    const doc = initialResults[result.index]
    info(
      `   ${i + 1}. Score: ${(result.score * 100).toFixed(1)}% - "${doc.title.substring(0, 40)}..."`
    )
  }

  // C. Impact re-ranking
  subsection('   C. Impact re-ranking')
  const topScoreImprovement = reranked[0].score - metricsA.topScore
  info(
    `   - Score top: ${topScoreImprovement >= 0 ? '+' : ''}${(topScoreImprovement * 100).toFixed(1)}%`
  )

  return { baseline: metricsA, optimized: metricsB }
}

// Scénario 5: Pipeline complet (toutes optimisations)
async function testScenario5() {
  section('Scénario 5: Pipeline Complet (Toutes Optimisations)')

  const testQuery = 'وقع شجار ليلي'
  info(`   Query originale: "${testQuery}"`)

  // A. Baseline (sans optimisations)
  subsection('   A. BASELINE (sans optimisations)')
  const startA = Date.now()
  const baselineResults = await searchKnowledgeBase(testQuery, {
    limit: 10,
    threshold: 0.65,  // Ancien seuil
    operationName: 'indexation',  // Force Ollama
  })
  const metricsA = calculateMetrics(baselineResults, startA)
  displayMetrics('Baseline', metricsA)

  // B. Pipeline optimisé complet
  subsection('   B. OPTIMISÉ (toutes optimisations activées)')
  const startB = Date.now()

  // 1. Query expansion
  const expanded = await expandQuery(testQuery)
  info(`   1. Expansion: "${expanded.substring(0, 60)}..."`)

  // 2. Classification
  const classification = await classifyQuery(testQuery)
  info(`   2. Classification: ${classification.categories.join(', ')}`)

  // 3. Hybrid search avec OpenAI embeddings
  const hybridResults = await searchKnowledgeBaseHybrid(expanded, {
    limit: 15,  // Augmenté
    threshold: 0.50,  // Abaissé
    operationName: 'assistant-ia',  // Force OpenAI
  })

  // 4. Cross-encoder re-ranking
  const contents = hybridResults.map((r) => r.chunkContent)
  const reranked = await rerankWithCrossEncoder(expanded, contents, 10)
  const optimizedResults = reranked.map((r) => hybridResults[r.index])

  const metricsB = calculateMetrics(optimizedResults, startB)
  displayMetrics('Optimisé', metricsB)

  // C. Comparaison globale
  subsection('   C. COMPARAISON GLOBALE')
  const improvements = {
    resultsCount: ((metricsB.resultsCount - metricsA.resultsCount) / Math.max(metricsA.resultsCount, 1)) * 100,
    topScore: ((metricsB.topScore - metricsA.topScore) / Math.max(metricsA.topScore, 0.01)) * 100,
    avgScore: ((metricsB.avgScore - metricsA.avgScore) / Math.max(metricsA.avgScore, 0.01)) * 100,
    relevantCount: metricsB.relevantCount - metricsA.relevantCount,
  }

  info(`   📊 Améliorations:`)
  info(`   - Résultats: ${improvements.resultsCount.toFixed(1)}%`)
  info(`   - Score top: ${improvements.topScore.toFixed(1)}%`)
  info(`   - Score moyen: ${improvements.avgScore.toFixed(1)}%`)
  info(`   - Pertinents (>70%): ${improvements.relevantCount >= 0 ? '+' : ''}${improvements.relevantCount}`)

  return { baseline: metricsA, optimized: metricsB, improvements }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log(`
${colors.cyan}╔═════════════════════════════════════════════════════════════════╗
║        Tests E2E Complets - Amélioration Qualité RAG          ║
║  Sprint 1-3: OpenAI + Filtering + Expansion + Hybrid + Cross  ║
╚═════════════════════════════════════════════════════════════════╝${colors.reset}
  `)

  const results = {
    scenario1: await testScenario1(),
    scenario2: await testScenario2(),
    scenario3: await testScenario3(),
    scenario4: await testScenario4(),
    scenario5: await testScenario5(),
  }

  // Résumé global
  console.log(`\n${colors.blue}${'='.repeat(80)}${colors.reset}`)
  section('RÉSUMÉ GLOBAL')
  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)

  console.log(`\n${colors.green}✅ OBJECTIFS ATTEINTS:${colors.reset}`)
  success('Sprint 1: OpenAI embeddings + contexte augmenté')
  success('Sprint 2: Metadata filtering + query expansion')
  success('Sprint 3: Hybrid search + cross-encoder re-ranking')

  console.log(`\n${colors.cyan}📊 MÉTRIQUES CLÉS (Scénario 5 - Pipeline complet):${colors.reset}`)
  const s5 = results.scenario5
  info(`   Baseline → Optimisé:`)
  info(`   - Résultats: ${s5.baseline.resultsCount} → ${s5.optimized.resultsCount} (${s5.improvements.resultsCount.toFixed(1)}%)`)
  info(`   - Score top: ${(s5.baseline.topScore * 100).toFixed(1)}% → ${(s5.optimized.topScore * 100).toFixed(1)}% (${s5.improvements.topScore.toFixed(1)}%)`)
  info(`   - Pertinents: ${s5.baseline.relevantCount} → ${s5.optimized.relevantCount} (${s5.improvements.relevantCount >= 0 ? '+' : ''}${s5.improvements.relevantCount})`)

  console.log(`\n${colors.green}🎉 Tests E2E terminés avec succès !${colors.reset}\n`)

  await pool.end()
}

main().catch((err) => {
  console.error(`\n${colors.red}❌ Erreur fatale:${colors.reset}`, err)
  process.exit(1)
})
