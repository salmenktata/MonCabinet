#!/usr/bin/env tsx
/**
 * Tests de validation Sprint 1 - OpenAI Embeddings + Contexte Augmenté
 *
 * Usage: npx tsx scripts/test-rag-sprint1.ts
 *
 * Tests:
 * 1. Vérifier provider OpenAI pour assistant-ia
 * 2. Vérifier dimensions embedding (1536)
 * 3. Tester recherche KB avec OpenAI
 * 4. Comparer scores Ollama vs OpenAI
 * 5. Vérifier limites RAG (15 résultats, 6000 tokens)
 *
 * Février 2026 - Validation Sprint 1
 */

import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { searchKnowledgeBase } from '@/lib/ai/knowledge-base-service'
import { aiConfig } from '@/lib/ai/config'
import { pool } from '@/lib/db'

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

function warning(msg: string) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
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
// Test 1: Provider OpenAI pour assistant-ia
// -----------------------------------------------------------------------------

async function testProviderOpenAI() {
  section('Test 1: Provider OpenAI pour assistant-ia')

  try {
    const result = await generateEmbedding('Test embedding OpenAI', {
      operationName: 'assistant-ia',
    })

    assert(
      result.provider === 'openai',
      `Provider correct: ${result.provider}`,
      result.provider !== 'openai' ? `Attendu: openai, Obtenu: ${result.provider}` : undefined
    )

    assert(
      result.embedding.length === 1536,
      `Dimensions correctes: ${result.embedding.length}`,
      result.embedding.length !== 1536 ? `Attendu: 1536, Obtenu: ${result.embedding.length}` : undefined
    )

    info(`   Tokens utilisés: ${result.tokenCount}`)
  } catch (err) {
    error(`Erreur test provider: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 2: Provider Ollama pour indexation (comparaison)
// -----------------------------------------------------------------------------

async function testProviderOllama() {
  section('Test 2: Provider Ollama pour indexation (comparaison)')

  try {
    const result = await generateEmbedding('Test embedding Ollama', {
      operationName: 'indexation',
    })

    assert(
      result.provider === 'ollama',
      `Provider correct: ${result.provider}`,
      result.provider !== 'ollama' ? `Attendu: ollama, Obtenu: ${result.provider}` : undefined
    )

    assert(
      result.embedding.length === 1024,
      `Dimensions correctes: ${result.embedding.length}`,
      result.embedding.length !== 1024 ? `Attendu: 1024, Obtenu: ${result.embedding.length}` : undefined
    )
  } catch (err) {
    error(`Erreur test Ollama: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 3: Recherche KB avec OpenAI
// -----------------------------------------------------------------------------

async function testKBSearchOpenAI() {
  section('Test 3: Recherche KB avec OpenAI')

  try {
    const results = await searchKnowledgeBase('الدفاع الشرعي', {
      limit: 10,
      operationName: 'assistant-ia',
    })

    assert(
      results.length > 0,
      `Résultats trouvés: ${results.length}`,
      results.length === 0 ? 'Aucun résultat (vérifier KB indexée)' : undefined
    )

    if (results.length > 0) {
      const topResult = results[0]
      info(`   Top résultat: "${topResult.title.substring(0, 50)}..."`)
      info(`   Similarité: ${(topResult.similarity * 100).toFixed(1)}%`)
      info(`   Catégorie: ${topResult.category}`)

      assert(
        topResult.similarity >= 0.5,
        `Score similarité acceptable: ${(topResult.similarity * 100).toFixed(1)}%`,
        topResult.similarity < 0.5 ? 'Score trop faible (<50%)' : undefined
      )

      // Vérifier progression qualité (objectif: >70%)
      if (topResult.similarity >= 0.70) {
        success(`   🎯 Objectif qualité atteint: ${(topResult.similarity * 100).toFixed(1)}% (>70%)`)
      } else if (topResult.similarity >= 0.60) {
        warning(`   Qualité bonne mais sous objectif: ${(topResult.similarity * 100).toFixed(1)}% (objectif: >70%)`)
      }
    }
  } catch (err) {
    error(`Erreur recherche KB: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 4: Limites RAG augmentées
// -----------------------------------------------------------------------------

async function testRAGLimits() {
  section('Test 4: Limites RAG augmentées')

  const expectedMaxResults = 15
  const expectedMaxTokens = 6000
  const expectedThresholdKB = 0.50

  assert(
    aiConfig.rag.maxResults === expectedMaxResults,
    `RAG_MAX_RESULTS: ${aiConfig.rag.maxResults}`,
    aiConfig.rag.maxResults !== expectedMaxResults
      ? `Attendu: ${expectedMaxResults}, Obtenu: ${aiConfig.rag.maxResults}`
      : undefined
  )

  // Note: RAG_MAX_CONTEXT_TOKENS pourrait ne pas être dans aiConfig
  info(`   RAG_MAX_CONTEXT_TOKENS: ${process.env.RAG_MAX_CONTEXT_TOKENS || 'non défini'}`)

  // Vérifier seuil KB
  const thresholdKB = parseFloat(process.env.RAG_THRESHOLD_KB || '0.65')
  assert(
    thresholdKB === expectedThresholdKB,
    `RAG_THRESHOLD_KB: ${thresholdKB}`,
    thresholdKB !== expectedThresholdKB
      ? `Attendu: ${expectedThresholdKB}, Obtenu: ${thresholdKB}`
      : undefined
  )
}

// -----------------------------------------------------------------------------
// Test 5: Migration SQL (colonnes + fonctions)
// -----------------------------------------------------------------------------

async function testMigrationSQL() {
  section('Test 5: Migration SQL (colonnes + fonctions)')

  try {
    // Vérifier colonne embedding_openai
    const columnCheck = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'knowledge_base_chunks'
        AND column_name = 'embedding_openai'
    `)

    assert(
      columnCheck.rows.length > 0,
      'Colonne embedding_openai existe',
      columnCheck.rows.length === 0 ? 'Colonne manquante (migration non appliquée)' : undefined
    )

    // Vérifier fonction search_knowledge_base_flexible
    const functionCheck = await pool.query(`
      SELECT routine_name
      FROM information_schema.routines
      WHERE routine_name = 'search_knowledge_base_flexible'
        AND routine_schema = 'public'
    `)

    assert(
      functionCheck.rows.length > 0,
      'Fonction search_knowledge_base_flexible existe',
      functionCheck.rows.length === 0 ? 'Fonction manquante (migration non appliquée)' : undefined
    )

    // Vérifier vue stats migration
    const viewCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.views
      WHERE table_name = 'vw_kb_embedding_migration_stats'
    `)

    assert(
      viewCheck.rows.length > 0,
      'Vue vw_kb_embedding_migration_stats existe',
      viewCheck.rows.length === 0 ? 'Vue manquante (migration non appliquée)' : undefined
    )

    // Afficher stats migration
    if (viewCheck.rows.length > 0) {
      const stats = await pool.query(`SELECT * FROM vw_kb_embedding_migration_stats`)
      if (stats.rows.length > 0) {
        const stat = stats.rows[0]
        info(`   Total chunks: ${stat.total_chunks}`)
        info(`   Embeddings Ollama: ${stat.chunks_ollama}`)
        info(`   Embeddings OpenAI: ${stat.chunks_openai}`)
        info(`   Progression OpenAI: ${stat.pct_openai_complete}%`)
      }
    }
  } catch (err) {
    error(`Erreur vérification migration: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// -----------------------------------------------------------------------------
// Test 6: Comparaison scores Ollama vs OpenAI
// -----------------------------------------------------------------------------

async function testCompareScores() {
  section('Test 6: Comparaison scores Ollama vs OpenAI (même query)')

  const testQuery = 'شروط الدفاع الشرعي في القانون التونسي'

  try {
    // Générer embedding Ollama
    info('   Génération embedding Ollama...')
    const ollamaEmbedding = await generateEmbedding(testQuery, {
      operationName: 'indexation', // Utilise Ollama
    })

    // Générer embedding OpenAI
    info('   Génération embedding OpenAI...')
    const openaiEmbedding = await generateEmbedding(testQuery, {
      operationName: 'assistant-ia', // Utilise OpenAI
    })

    assert(
      ollamaEmbedding.provider === 'ollama',
      `Embedding 1 utilise Ollama: ${ollamaEmbedding.provider}`,
    )

    assert(
      openaiEmbedding.provider === 'openai',
      `Embedding 2 utilise OpenAI: ${openaiEmbedding.provider}`,
    )

    // Recherche avec les deux embeddings (si KB a les deux types)
    info('   Comparaison scores...')
    info(`   Note: Comparaison directe impossible si KB n'a qu'un type d'embedding`)

  } catch (err) {
    error(`Erreur comparaison: ${err instanceof Error ? err.message : err}`)
    failedTests++
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log(`
${colors.cyan}╔═══════════════════════════════════════════════════════════════╗
║  Tests de Validation Sprint 1 - OpenAI Embeddings + Limites ║
╚═══════════════════════════════════════════════════════════════╝${colors.reset}
  `)

  await testProviderOpenAI()
  await testProviderOllama()
  await testKBSearchOpenAI()
  await testRAGLimits()
  await testMigrationSQL()
  await testCompareScores()

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
    console.log(`${colors.green}🎉 Sprint 1 validé avec succès !${colors.reset}\n`)
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
