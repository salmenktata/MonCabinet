#!/usr/bin/env tsx
/**
 * Tests de validation Sprint 3 - Hybrid Search + Cross-Encoder
 *
 * Usage: npx tsx scripts/test-rag-sprint3.ts
 *
 * Tests:
 * 1. Fonction SQL search_knowledge_base_hybrid existe
 * 2. Colonne ts_vector existe et est indexée
 * 3. Cross-encoder modèle charge et fonctionne
 * 4. Re-ranking neural améliore scores
 * 5. Hybrid search vs vectoriel pur (comparaison)
 *
 * Février 2026 - Validation Sprint 3
 */

import { pool } from '@/lib/db'
import {
  rerankWithCrossEncoder,
  isCrossEncoderLoaded,
  warmupCrossEncoder,
  getCrossEncoderInfo,
} from '@/lib/ai/cross-encoder-service'
import { searchKnowledgeBase, searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'

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

// =============================================================================
// TESTS
// =============================================================================

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string, details?: string) {
  if (condition) {
    success(message)
    passedTests++
  } else {
    error(message)
    if (details) console.log(`   ${details}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 1: Migration SQL Hybrid Search
// -----------------------------------------------------------------------------

async function testMigrationSQL() {
  section('Test 1: Migration SQL Hybrid Search')

  try {
    // Vérifier colonne ts_vector
    const columnCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'knowledge_base_chunks'
        AND column_name = 'content_tsvector'
    `)

    assert(
      columnCheck.rows.length > 0,
      'Colonne content_tsvector existe',
      columnCheck.rows.length === 0 ? 'Colonne manquante (migration non appliquée)' : undefined
    )

    // Vérifier index GIN
    const indexCheck = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'knowledge_base_chunks'
        AND indexname = 'idx_kb_chunks_tsvector_gin'
    `)

    assert(
      indexCheck.rows.length > 0,
      'Index GIN sur ts_vector existe',
      indexCheck.rows.length === 0 ? 'Index manquant (migration non appliquée)' : undefined
    )

    // Vérifier fonction hybrid search
    const functionCheck = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_name = 'search_knowledge_base_hybrid'
        AND routine_schema = 'public'
    `)

    assert(
      functionCheck.rows.length > 0,
      'Fonction search_knowledge_base_hybrid existe',
      functionCheck.rows.length === 0 ? 'Fonction manquante (migration non appliquée)' : undefined
    )

    // Vérifier vue stats
    const viewCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_name = 'vw_kb_search_coverage'
    `)

    assert(
      viewCheck.rows.length > 0,
      'Vue vw_kb_search_coverage existe',
      viewCheck.rows.length === 0 ? 'Vue manquante (migration non appliquée)' : undefined
    )

    // Afficher stats couverture
    if (viewCheck.rows.length > 0) {
      const stats = await pool.query(`SELECT * FROM vw_kb_search_coverage`)
      if (stats.rows.length > 0) {
        const stat = stats.rows[0]
        info(`   Chunks avec embedding: ${stat.chunks_with_embedding}`)
        info(`   Chunks avec ts_vector: ${stat.chunks_with_tsvector}`)
        info(`   Chunks avec les deux: ${stat.chunks_with_both}`)
        info(`   Couverture BM25: ${stat.pct_bm25_coverage}%`)
      }
    }
  } catch (err) {
    error(`Erreur vérification migration: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 2: Cross-Encoder Chargement
// -----------------------------------------------------------------------------

async function testCrossEncoderLoading() {
  section('Test 2: Cross-Encoder Chargement Modèle')

  try {
    info('   Warmup cross-encoder (peut prendre 3-5s la première fois)...')

    const startTime = Date.now()
    await warmupCrossEncoder()
    const loadTime = ((Date.now() - startTime) / 1000).toFixed(2)

    assert(
      isCrossEncoderLoaded(),
      `Modèle cross-encoder chargé en ${loadTime}s`,
    )

    const modelInfo = getCrossEncoderInfo()
    info(`   Modèle: ${modelInfo.model}`)
    info(`   Batch size: ${modelInfo.batchSize}`)
  } catch (err) {
    error(`Erreur chargement cross-encoder: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 3: Cross-Encoder Re-ranking
// -----------------------------------------------------------------------------

async function testCrossEncoderReranking() {
  section('Test 3: Cross-Encoder Re-ranking')

  const query = 'ما هي شروط الدفاع الشرعي؟'
  const documents = [
    'الدفاع الشرعي يتطلب وجود خطر حال وغير مشروع',  // Pertinent
    'العقد التجاري يجب أن يكون مكتوب وموقع',         // Non pertinent
    'شروط الدفاع الشرعي ثلاثة: الخطر الحال، تناسب الرد، وعدم القدرة على اللجوء للسلطة',  // Très pertinent
    'القانون الجنائي التونسي',                        // Peu pertinent
  ]

  try {
    info(`   Query: ${query}`)
    info(`   Documents: ${documents.length}`)

    const startTime = Date.now()
    const ranked = await rerankWithCrossEncoder(query, documents, 4)
    const rerankTime = ((Date.now() - startTime) / 1000).toFixed(2)

    assert(
      ranked.length === documents.length,
      `Tous les documents re-rankés: ${ranked.length}/${documents.length}`,
    )

    info(`\n   Résultats re-ranking (${rerankTime}s):`)
    for (let i = 0; i < Math.min(ranked.length, 3); i++) {
      const result = ranked[i]
      const docPreview = documents[result.index].substring(0, 40)
      info(`   ${i + 1}. Score: ${(result.score * 100).toFixed(1)}% - "${docPreview}..."`)
    }

    // Vérifier que le document le plus pertinent est bien classé premier
    const topDoc = documents[ranked[0].index]
    const isRelevant = topDoc.includes('شروط الدفاع') || topDoc.includes('خطر حال')

    assert(
      isRelevant,
      'Document le plus pertinent classé en top',
      !isRelevant ? `Top doc: ${topDoc.substring(0, 50)}` : undefined
    )

    // Vérifier que scores sont décroissants
    const scoresDecreasing = ranked.every((r, i) =>
      i === 0 || r.score <= ranked[i - 1].score
    )

    assert(
      scoresDecreasing,
      'Scores triés par ordre décroissant',
    )
  } catch (err) {
    error(`Erreur re-ranking: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 4: Hybrid Search vs Vectoriel Pur
// -----------------------------------------------------------------------------

async function testHybridVsVectorial() {
  section('Test 4: Hybrid Search vs Vectoriel Pur')

  const query = 'دفاع شرعي'  // Keywords courts (favorise BM25)

  try {
    info(`   Query: ${query}`)

    // A. Recherche vectorielle pure
    info('\n   A. Recherche VECTORIELLE pure:')
    const vectorResults = await searchKnowledgeBase(query, {
      limit: 5,
      operationName: 'assistant-ia',
    })

    info(`   - Résultats: ${vectorResults.length}`)
    if (vectorResults.length > 0) {
      info(`   - Score top: ${(vectorResults[0].similarity * 100).toFixed(1)}%`)
      info(`   - Titre: ${vectorResults[0].title.substring(0, 50)}`)
    }

    // B. Recherche hybride (vectoriel + BM25)
    info('\n   B. Recherche HYBRIDE (vectoriel + BM25):')
    const hybridResults = await searchKnowledgeBaseHybrid(query, {
      limit: 5,
      operationName: 'assistant-ia',
    })

    info(`   - Résultats: ${hybridResults.length}`)
    if (hybridResults.length > 0) {
      info(`   - Score top: ${(hybridResults[0].similarity * 100).toFixed(1)}%`)
      info(`   - Titre: ${hybridResults[0].title.substring(0, 50)}`)
    }

    // Comparaison
    if (vectorResults.length > 0 && hybridResults.length > 0) {
      const countDiff = hybridResults.length - vectorResults.length
      const scoreDiff = hybridResults[0].similarity - vectorResults[0].similarity

      info(`\n   📊 Comparaison:`)
      info(`   - Nombre résultats: ${countDiff >= 0 ? '+' : ''}${countDiff}`)
      info(`   - Score top: ${scoreDiff >= 0 ? '+' : ''}${(scoreDiff * 100).toFixed(1)}%`)

      assert(
        hybridResults.length > 0,
        'Hybrid search trouve des résultats',
      )

      // Hybrid devrait au minimum égaler vectoriel
      if (hybridResults.length >= vectorResults.length) {
        success(`Hybrid trouve autant ou plus de résultats (+${countDiff})`)
      } else {
        error(`Hybrid trouve moins de résultats (${countDiff})`)
        failedTests++
      }
    }
  } catch (err) {
    error(`Erreur comparaison hybrid vs vectoriel: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 5: Performance Hybrid Search
// -----------------------------------------------------------------------------

async function testPerformanceHybrid() {
  section('Test 5: Performance Hybrid Search')

  const testQueries = [
    'دفاع شرعي',
    'عقد كراء',
    'قانون الشغل',
  ]

  try {
    for (const query of testQueries) {
      info(`\n   Query: ${query}`)

      const startTime = Date.now()
      const results = await searchKnowledgeBaseHybrid(query, {
        limit: 10,
        operationName: 'assistant-ia',
      })
      const duration = Date.now() - startTime

      info(`   - Temps: ${duration}ms`)
      info(`   - Résultats: ${results.length}`)

      // Vérifier latence acceptable (<5s)
      assert(
        duration < 5000,
        `Latence acceptable: ${duration}ms (<5s)`,
        duration >= 5000 ? `Trop lent: ${duration}ms` : undefined
      )
    }
  } catch (err) {
    error(`Erreur test performance: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log(`
${colors.cyan}╔═════════════════════════════════════════════════════════════════╗
║  Tests Sprint 3 - Hybrid Search + Cross-Encoder Re-ranking    ║
╚═════════════════════════════════════════════════════════════════╝${colors.reset}
  `)

  await testMigrationSQL()
  await testCrossEncoderLoading()
  await testCrossEncoderReranking()
  await testHybridVsVectorial()
  await testPerformanceHybrid()

  // Résumé
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)
  console.log(`${colors.cyan}RÉSUMÉ${colors.reset}`)
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`)

  const total = passedTests + failedTests
  const percentage = total > 0 ? ((passedTests / total) * 100).toFixed(1) : '0'

  console.log(`\n${colors.green}✓ Tests réussis: ${passedTests}${colors.reset}`)
  console.log(`${colors.red}✗ Tests échoués: ${failedTests}${colors.reset}`)
  console.log(`${colors.cyan}  Taux de réussite: ${percentage}%${colors.reset}\n`)

  if (failedTests === 0) {
    console.log(`${colors.green}🎉 Sprint 3 validé avec succès !${colors.reset}\n`)
  } else {
    console.log(`${colors.yellow}⚠️  Certains tests ont échoué. Vérifiez la configuration.${colors.reset}\n`)
  }

  await pool.end()
  process.exit(failedTests > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(`\n${colors.red}❌ Erreur fatale:${colors.reset}`, err)
  process.exit(1)
})
