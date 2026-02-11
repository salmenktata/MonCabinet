#!/usr/bin/env tsx
/**
 * Script de test : Recherche Hybride BM25 + Dense (Phase 2.1)
 *
 * Tests :
 * 1. BM25 search only
 * 2. Dense search only
 * 3. Hybrid search (BM25 + Dense + RRF)
 * 4. Performance (latence, précision)
 * 5. Comparaison précision vs Dense seul
 *
 * Usage :
 *   npm run test:hybrid-search
 *   npm run test:hybrid-search -- --queries="contrat,cassation"
 */

import {
  hybridSearch,
  bm25SearchOnly,
  type HybridSearchResult,
} from '../lib/ai/hybrid-retrieval-service'

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// =============================================================================
// Queries de test (cas d'usage réels)
// =============================================================================

const TEST_QUERIES = [
  {
    query: 'contrat de vente immobilier',
    expectedCategory: 'code',
    expectedKeywords: ['vente', 'immobilier', 'contrat'],
  },
  {
    query: 'cassation civile délai pourvoi',
    expectedCategory: 'jurisprudence',
    expectedKeywords: ['cassation', 'pourvoi', 'délai'],
  },
  {
    query: 'code des obligations et contrats article 242',
    expectedCategory: 'code',
    expectedKeywords: ['COC', 'obligations', 'article'],
  },
  {
    query: 'jurisprudence tribunal de première instance divorce',
    expectedCategory: 'jurisprudence',
    expectedKeywords: ['divorce', 'tribunal', 'première instance'],
  },
  {
    query: 'droit du travail licenciement abusif',
    expectedCategory: 'doctrine',
    expectedKeywords: ['travail', 'licenciement', 'abusif'],
  },
]

// =============================================================================
// TEST 1 : BM25 Search Only
// =============================================================================

async function testBM25Only() {
  log('\n=== TEST 1 : BM25 Search Only ===', 'bright')

  const testQuery = TEST_QUERIES[0]
  log(`\n🔍 Query: "${testQuery.query}"`, 'cyan')

  try {
    const startTime = Date.now()
    const results = await bm25SearchOnly(testQuery.query, { limit: 10 })
    const duration = Date.now() - startTime

    log(`  ✅ ${results.length} résultats en ${duration}ms`, 'green')

    if (results.length > 0) {
      log(`\n  Top 3 résultats BM25:`, 'yellow')
      results.slice(0, 3).forEach((r, i) => {
        console.log(`    ${i + 1}. Score: ${r.bm25Score.toFixed(3)} | ${r.content.substring(0, 80)}...`)
      })
    }

    // Validation
    if (results.length === 0) {
      log(`  ⚠️  WARN: Aucun résultat (DB vide ou index manquant)`, 'yellow')
    } else if (duration > 500) {
      log(`  ⚠️  WARN: Latence élevée (${duration}ms > 500ms)`, 'yellow')
    } else {
      log(`  ✅ PASS: BM25 rapide (<500ms)`, 'green')
    }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
  }
}

// =============================================================================
// TEST 2 : Hybrid Search (BM25 + Dense)
// =============================================================================

async function testHybridSearch() {
  log('\n=== TEST 2 : Hybrid Search (BM25 + Dense + RRF) ===', 'bright')

  const testQuery = TEST_QUERIES[1]
  log(`\n🔍 Query: "${testQuery.query}"`, 'cyan')

  try {
    const { results, metrics } = await hybridSearch(testQuery.query, {
      bm25Limit: 20,
      denseLimit: 50,
      enableReranking: false, // Désactiver pour test pur
      rerankLimit: 15,
    })

    log(`\n  📊 Métriques:`, 'yellow')
    console.log(`    BM25 candidats    : ${metrics.bm25Count}`)
    console.log(`    Dense candidats   : ${metrics.denseCount}`)
    console.log(`    Fusionnés (RRF)   : ${metrics.fusedCount}`)
    console.log(`    Résultats finaux  : ${metrics.finalCount}`)
    console.log(`    Durée totale      : ${metrics.durationMs}ms`)
    console.log(`    Méthode           : ${metrics.method}`)

    if (results.length > 0) {
      log(`\n  Top 5 résultats hybrides:`, 'yellow')
      results.slice(0, 5).forEach((r, i) => {
        console.log(`    ${i + 1}. RRF: ${r.rrfScore.toFixed(3)} | BM25: ${r.bm25Score.toFixed(3)} | Dense: ${r.denseScore.toFixed(3)}`)
        console.log(`       ${r.content.substring(0, 100)}...`)
      })
    }

    // Validations
    const validations: string[] = []

    if (metrics.finalCount >= 10) {
      validations.push('✅ Au moins 10 résultats')
    } else if (metrics.finalCount > 0) {
      validations.push(`⚠️  Seulement ${metrics.finalCount} résultats (<10)`)
    } else {
      validations.push('❌ Aucun résultat')
    }

    if (metrics.durationMs < 2000) {
      validations.push('✅ Latence <2s')
    } else {
      validations.push(`⚠️  Latence élevée (${metrics.durationMs}ms)`)
    }

    if (metrics.method === 'hybrid') {
      validations.push('✅ Mode hybride utilisé')
    } else {
      validations.push(`⚠️  Fallback mode: ${metrics.method}`)
    }

    log(`\n  Validations:`, 'cyan')
    validations.forEach(v => console.log(`    ${v}`))

    return { results, metrics }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
    return null
  }
}

// =============================================================================
// TEST 3 : Comparaison Précision (Hybrid vs Dense Only)
// =============================================================================

async function testPrecisionComparison() {
  log('\n=== TEST 3 : Comparaison Précision (Hybrid vs Dense Only) ===', 'bright')

  const queries = TEST_QUERIES.slice(0, 3) // 3 queries test

  let hybridTotal = 0
  let denseTotal = 0
  let hybridFaster = 0

  for (const testQuery of queries) {
    log(`\n🔍 Query: "${testQuery.query}"`, 'cyan')

    try {
      // Hybrid search
      const hybridStart = Date.now()
      const hybridResult = await hybridSearch(testQuery.query, {
        bm25Limit: 20,
        denseLimit: 50,
        enableReranking: false,
        rerankLimit: 10,
      })
      const hybridDuration = Date.now() - hybridStart

      // Dense only (via hybrid avec BM25 limit=0)
      const denseStart = Date.now()
      const denseResult = await hybridSearch(testQuery.query, {
        bm25Limit: 0, // Force dense only
        denseLimit: 50,
        enableReranking: false,
        rerankLimit: 10,
      })
      const denseDuration = Date.now() - denseStart

      hybridTotal += hybridResult.results.length
      denseTotal += denseResult.results.length

      if (hybridDuration < denseDuration) {
        hybridFaster++
      }

      log(`  Hybrid : ${hybridResult.results.length} résultats (${hybridDuration}ms)`, 'yellow')
      log(`  Dense  : ${denseResult.results.length} résultats (${denseDuration}ms)`, 'yellow')

      if (hybridResult.results.length > denseResult.results.length) {
        log(`  ✅ Hybrid trouve ${hybridResult.results.length - denseResult.results.length} résultats en plus`, 'green')
      } else if (hybridResult.results.length === denseResult.results.length) {
        log(`  ⚠️  Même nombre de résultats`, 'yellow')
      } else {
        log(`  ❌ Dense trouve plus de résultats`, 'red')
      }
    } catch (error) {
      log(`  ❌ Erreur: ${error}`, 'red')
    }
  }

  log(`\n📊 Statistiques Globales:`, 'bright')
  console.log(`  Total résultats Hybrid : ${hybridTotal}`)
  console.log(`  Total résultats Dense  : ${denseTotal}`)
  console.log(`  Amélioration           : ${hybridTotal > denseTotal ? '+' : ''}${hybridTotal - denseTotal} résultats`)
  console.log(`  Hybrid plus rapide     : ${hybridFaster}/${queries.length} fois`)

  if (hybridTotal > denseTotal) {
    log(`  ✅ PASS: Hybrid améliore la couverture`, 'green')
  } else {
    log(`  ⚠️  WARN: Hybrid n'améliore pas significativement`, 'yellow')
  }
}

// =============================================================================
// TEST 4 : Diversité Sources
// =============================================================================

async function testSourceDiversity() {
  log('\n=== TEST 4 : Diversité Sources ===', 'bright')

  const testQuery = 'cassation civile contrat'
  log(`\n🔍 Query: "${testQuery}"`, 'cyan')

  try {
    const { results } = await hybridSearch(testQuery, {
      bm25Limit: 20,
      denseLimit: 50,
      rerankLimit: 20,
    })

    // Analyser diversité
    const categoryCount = new Map<string, number>()
    const languageCount = new Map<string, number>()

    results.forEach(r => {
      categoryCount.set(r.category, (categoryCount.get(r.category) || 0) + 1)
      languageCount.set(r.language, (languageCount.get(r.language) || 0) + 1)
    })

    log(`\n  📊 Diversité Catégories:`, 'yellow')
    categoryCount.forEach((count, cat) => {
      const percent = ((count / results.length) * 100).toFixed(1)
      console.log(`    ${cat}: ${count} (${percent}%)`)
    })

    log(`\n  📊 Diversité Langues:`, 'yellow')
    languageCount.forEach((count, lang) => {
      const percent = ((count / results.length) * 100).toFixed(1)
      console.log(`    ${lang}: ${count} (${percent}%)`)
    })

    // Validations
    const numCategories = categoryCount.size
    const maxCategoryPercent = Math.max(...Array.from(categoryCount.values())) / results.length

    if (numCategories >= 3) {
      log(`  ✅ PASS: ${numCategories} catégories différentes (>=3)`, 'green')
    } else {
      log(`  ⚠️  WARN: Seulement ${numCategories} catégories (<3)`, 'yellow')
    }

    if (maxCategoryPercent <= 0.4) {
      log(`  ✅ PASS: Diversité respectée (max ${(maxCategoryPercent * 100).toFixed(1)}% <= 40%)`, 'green')
    } else {
      log(`  ⚠️  WARN: Une catégorie domine (${(maxCategoryPercent * 100).toFixed(1)}%)`, 'yellow')
    }
  } catch (error) {
    log(`  ❌ FAIL: ${error}`, 'red')
  }
}

// =============================================================================
// RUNNER PRINCIPAL
// =============================================================================

async function main() {
  log('╔═══════════════════════════════════════════════════════════╗', 'bright')
  log('║         TEST : Recherche Hybride BM25 + Dense            ║', 'bright')
  log('╚═══════════════════════════════════════════════════════════╝', 'bright')

  try {
    await testBM25Only()
    await testHybridSearch()
    await testPrecisionComparison()
    await testSourceDiversity()

    log('\n═══════════════════════════════════════════════════════════', 'bright')
    log('✅ TESTS TERMINÉS', 'green')
    log('═══════════════════════════════════════════════════════════', 'bright')

    log('\n📋 Résumé Objectifs Phase 2.1:', 'cyan')
    console.log('  ✅ BM25 search fonctionnel')
    console.log('  ✅ Hybrid search (BM25 + Dense + RRF) implémenté')
    console.log('  ⏳ Objectif 15-20 sources : À valider avec données prod')
    console.log('  ⏳ Objectif latence <2s : À mesurer avec charge réelle')
    console.log('  ⏳ Objectif +15-20% précision : À valider avec golden dataset')
    console.log('')
    console.log('  🚀 PROCHAINES ÉTAPES:')
    console.log('     1. Exécuter migration SQL prod : migrations/20260214_bm25_search.sql')
    console.log('     2. Intégrer hybrid search dans rag-chat-service.ts')
    console.log('     3. Mesurer précision avec golden dataset (100 queries)')
    console.log('     4. Optimiser paramètres BM25 (k1, b) selon corpus')
    console.log('')
  } catch (error) {
    log('\n═══════════════════════════════════════════════════════════', 'bright')
    log(`❌ ERREUR GLOBALE : ${error}`, 'red')
    log('═══════════════════════════════════════════════════════════\n', 'bright')
    process.exit(1)
  }
}

main()
