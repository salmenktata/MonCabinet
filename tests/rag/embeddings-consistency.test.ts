/**
 * Tests E2E - Cohérence Embeddings RAG
 *
 * Ces tests vérifient que :
 * 1. Les embeddings query utilisent le bon provider (OpenAI en prod)
 * 2. Les embeddings KB sont cohérents avec la configuration
 * 3. La recherche retourne des résultats (pas de mismatch dimension)
 *
 * CRITIQUE : Exécuter avant CHAQUE déploiement qui modifie :
 * - lib/ai/operations-config.ts
 * - lib/ai/embeddings-service.ts
 * - lib/ai/knowledge-base-service.ts
 */

import { describe, it, expect, beforeAll } from '@jest/globals'
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { searchKnowledgeBaseHybrid } from '@/lib/ai/knowledge-base-service'
import { db } from '@/lib/db/postgres'

const IS_PRODUCTION = process.env.NODE_ENV === 'production'

describe('RAG Embeddings Consistency - Critical Tests', () => {
  let kbStats: {
    openaiChunks: number
    ollamaChunks: number
    totalChunks: number
  }

  beforeAll(async () => {
    // Récupérer stats KB
    const { rows } = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE embedding_openai IS NOT NULL) as openai_chunks,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as ollama_chunks,
        COUNT(*) as total_chunks
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_active = true
    `)

    kbStats = {
      openaiChunks: parseInt(rows[0].openai_chunks),
      ollamaChunks: parseInt(rows[0].ollama_chunks),
      totalChunks: parseInt(rows[0].total_chunks),
    }
  })

  // ===========================================================================
  // TEST 1 : Query Embeddings Provider
  // ===========================================================================

  it('should use OpenAI embeddings for assistant-ia queries in production', async () => {
    const query = 'الدفاع الشرعي' // Légitime défense

    const queryEmbedding = await generateEmbedding(query, {
      operationName: 'assistant-ia',
    })

    if (IS_PRODUCTION) {
      expect(queryEmbedding.provider).toBe('openai')
      expect(queryEmbedding.embedding.length).toBe(1536) // OpenAI text-embedding-3-small
    } else {
      // Dev peut utiliser Ollama
      expect(['openai', 'ollama']).toContain(queryEmbedding.provider)
    }
  }, 15000) // Timeout 15s pour génération embedding

  // ===========================================================================
  // TEST 2 : KB Embeddings Coverage
  // ===========================================================================

  it('should have majority of KB chunks with OpenAI embeddings in production', async () => {
    console.log('KB Stats:', kbStats)

    if (IS_PRODUCTION) {
      const openaiPercentage = (kbStats.openaiChunks / kbStats.totalChunks) * 100

      // Au moins 80% des chunks doivent avoir embeddings OpenAI en production
      expect(openaiPercentage).toBeGreaterThanOrEqual(80)

      // Warn si trop de chunks Ollama
      if (kbStats.ollamaChunks > kbStats.openaiChunks * 0.2) {
        console.warn(
          `⚠️  WARNING: ${kbStats.ollamaChunks} chunks Ollama vs ${kbStats.openaiChunks} OpenAI. Considérer réindexation.`
        )
      }
    }
  })

  // ===========================================================================
  // TEST 3 : Hybrid Search Returns Results
  // ===========================================================================

  it('should return results for common legal queries (no dimension mismatch)', async () => {
    const testQueries = [
      { query: 'الدفاع الشرعي', minResults: 1, description: 'Légitime défense (arabe)' },
      { query: 'contrat de travail', minResults: 1, description: 'Contrat travail (français)' },
      { query: 'القانون الجنائي', minResults: 1, description: 'Droit pénal (arabe)' },
    ]

    for (const test of testQueries) {
      const results = await searchKnowledgeBaseHybrid(test.query, {
        limit: 10,
        threshold: 0.25, // Seuil permissif pour test
        operationName: 'assistant-ia',
      })

      console.log(`  - "${test.description}": ${results.length} résultats`)

      // CRITIQUE : Si 0 résultats, c'est probablement un mismatch dimension
      if (results.length === 0) {
        console.error(`❌ ÉCHEC: Query "${test.query}" retourne 0 résultats`)
        console.error('   Causes possibles:')
        console.error('   1. Mismatch dimension embeddings (query vs KB)')
        console.error('   2. Cache Redis avec ancien embedding')
        console.error('   3. Provider incorrect (Ollama query, OpenAI KB)')
      }

      expect(results.length).toBeGreaterThanOrEqual(test.minResults)
    }
  }, 60000) // Timeout 60s pour toutes les queries

  // ===========================================================================
  // TEST 4 : Embedding Dimension Validation
  // ===========================================================================

  it('should generate embeddings with correct dimensions', async () => {
    const query = 'Test query for dimension validation'

    // assistant-ia operation
    const assistantEmbedding = await generateEmbedding(query, {
      operationName: 'assistant-ia',
    })

    // indexation operation (peut être différent)
    const indexationEmbedding = await generateEmbedding(query, {
      operationName: 'indexation',
    })

    // Vérifier dimensions connues
    const VALID_DIMENSIONS = [1024, 1536] // Ollama ou OpenAI
    expect(VALID_DIMENSIONS).toContain(assistantEmbedding.embedding.length)
    expect(VALID_DIMENSIONS).toContain(indexationEmbedding.embedding.length)

    // Warn si mismatch entre assistant et indexation
    if (assistantEmbedding.embedding.length !== indexationEmbedding.embedding.length) {
      console.warn(
        `⚠️  WARNING: Mismatch dimension embeddings: assistant-ia (${assistantEmbedding.embedding.length}) != indexation (${indexationEmbedding.embedding.length})`
      )
      console.warn(
        `   Cela peut causer 0 résultats si la KB a été indexée avec ${indexationEmbedding.embedding.length}-dim`
      )
    }
  }, 15000)

  // ===========================================================================
  // TEST 5 : Search Performance (Non-Blocking)
  // ===========================================================================

  it('should return search results within acceptable time', async () => {
    const query = 'الدفاع الشرعي'
    const startTime = Date.now()

    const results = await searchKnowledgeBaseHybrid(query, {
      limit: 15,
      threshold: 0.30,
      operationName: 'assistant-ia',
    })

    const duration = Date.now() - startTime

    console.log(`  - Recherche KB: ${duration}ms pour ${results.length} résultats`)

    // Warn si trop lent (> 10s)
    if (duration > 10000) {
      console.warn(`⚠️  WARNING: Recherche KB lente (${duration}ms > 10s)`)
    }

    // Pas de fail, juste warning
    expect(duration).toBeLessThan(30000) // Max 30s
  }, 35000)
})

describe('RAG Configuration Validation', () => {
  it('should have OLLAMA_ENABLED or OPENAI_API_KEY configured', () => {
    const hasOllama = process.env.OLLAMA_ENABLED === 'true'
    const hasOpenAI = !!process.env.OPENAI_API_KEY

    expect(hasOllama || hasOpenAI).toBe(true)

    if (!hasOllama && !hasOpenAI) {
      throw new Error(
        'RAG désactivé: Configurez OLLAMA_ENABLED=true ou OPENAI_API_KEY=sk-...'
      )
    }
  })

  it('should use correct embedding provider in production', () => {
    if (IS_PRODUCTION) {
      const hasOpenAI = !!process.env.OPENAI_API_KEY
      expect(hasOpenAI).toBe(true)

      if (!hasOpenAI) {
        throw new Error(
          'Production requiert OPENAI_API_KEY pour embeddings haute qualité'
        )
      }
    }
  })
})
