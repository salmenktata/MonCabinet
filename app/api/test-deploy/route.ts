import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { isSemanticSearchEnabled } from '@/lib/ai/config'

/**
 * Route API de test E2E pour validation déploiement
 *
 * Cette route effectue des tests critiques pour valider que le déploiement
 * est fonctionnel :
 * - Base de données accessible
 * - Configuration RAG valide
 * - Knowledge Base disponible
 * - Embeddings fonctionnels
 *
 * Fix: Semaine 1 - Suppression complète de .next/server avant docker cp
 * Sprint 1 - Tests E2E automatiques
 *
 * Test: curl https://qadhya.tn/api/test-deploy
 * Attendu: {"status":"ok","allTestsPassed":true,...}
 */
export async function GET() {
  const startTime = Date.now()
  const results: {
    database: { status: string; error?: string; latencyMs?: number }
    rag: { status: string; error?: string; config?: any }
    knowledgeBase: { status: string; error?: string; stats?: any }
    embeddings: { status: string; error?: string; provider?: string }
  } = {
    database: { status: 'unknown' },
    rag: { status: 'unknown' },
    knowledgeBase: { status: 'unknown' },
    embeddings: { status: 'unknown' },
  }

  // Test 1: Database connectivity
  try {
    const dbStart = Date.now()
    const dbResult = await db.query('SELECT NOW() as current_time')
    const dbLatency = Date.now() - dbStart

    if (dbResult.rows.length > 0) {
      results.database = {
        status: 'ok',
        latencyMs: dbLatency,
      }
    } else {
      results.database = {
        status: 'error',
        error: 'No result from database',
      }
    }
  } catch (error) {
    results.database = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Database connection failed',
    }
  }

  // Test 2: RAG Configuration
  try {
    const ragEnabled = process.env.RAG_ENABLED === 'true'
    const semanticSearchEnabled = isSemanticSearchEnabled()
    const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true'
    const openaiAvailable = !!process.env.OPENAI_API_KEY

    results.rag = {
      status: ragEnabled && semanticSearchEnabled ? 'ok' : 'warning',
      config: {
        ragEnabled,
        semanticSearchEnabled,
        ollamaEnabled,
        openaiAvailable,
      },
    }

    if (!ragEnabled || !semanticSearchEnabled) {
      results.rag.error = 'RAG not fully configured'
    }
  } catch (error) {
    results.rag = {
      status: 'error',
      error: error instanceof Error ? error.message : 'RAG config check failed',
    }
  }

  // Test 3: Knowledge Base
  try {
    const kbStats = await db.query<{
      total_docs: string
      total_chunks: string
      indexed_docs: string
    }>(`
      SELECT
        COUNT(DISTINCT kb.id) as total_docs,
        COUNT(kbc.id) as total_chunks,
        COUNT(DISTINCT CASE WHEN kbc.embedding IS NOT NULL THEN kb.id END) as indexed_docs
      FROM knowledge_base kb
      LEFT JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active = true
    `)

    const stats = kbStats.rows[0]
    const totalDocs = parseInt(stats.total_docs, 10)
    const totalChunks = parseInt(stats.total_chunks, 10)
    const indexedDocs = parseInt(stats.indexed_docs, 10)

    results.knowledgeBase = {
      status: totalDocs > 0 && totalChunks > 0 ? 'ok' : 'warning',
      stats: {
        totalDocs,
        totalChunks,
        indexedDocs,
        indexedPercent: totalDocs > 0 ? Math.round((indexedDocs / totalDocs) * 100) : 0,
      },
    }

    if (totalDocs === 0) {
      results.knowledgeBase.error = 'No documents in knowledge base'
    }
  } catch (error) {
    results.knowledgeBase = {
      status: 'error',
      error: error instanceof Error ? error.message : 'KB stats check failed',
    }
  }

  // Test 4: Embeddings Provider
  try {
    const ollamaEnabled = process.env.OLLAMA_ENABLED === 'true'
    const openaiKey = process.env.OPENAI_API_KEY
    let provider = 'none'

    if (openaiKey && openaiKey.startsWith('sk-')) {
      provider = 'openai'
    } else if (ollamaEnabled) {
      provider = 'ollama'
    }

    results.embeddings = {
      status: provider !== 'none' ? 'ok' : 'error',
      provider,
    }

    if (provider === 'none') {
      results.embeddings.error = 'No embedding provider configured'
    }
  } catch (error) {
    results.embeddings = {
      status: 'error',
      error: error instanceof Error ? error.message : 'Embeddings check failed',
    }
  }

  // Déterminer le statut global
  const allTestsPassed =
    results.database.status === 'ok' &&
    results.rag.status === 'ok' &&
    results.knowledgeBase.status === 'ok' &&
    results.embeddings.status === 'ok'

  const hasWarnings =
    results.database.status === 'warning' ||
    results.rag.status === 'warning' ||
    results.knowledgeBase.status === 'warning' ||
    results.embeddings.status === 'warning'

  const hasErrors =
    results.database.status === 'error' ||
    results.rag.status === 'error' ||
    results.knowledgeBase.status === 'error' ||
    results.embeddings.status === 'error'

  const globalStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'ok'

  const totalDuration = Date.now() - startTime

  return NextResponse.json(
    {
      status: globalStatus,
      allTestsPassed,
      timestamp: new Date().toISOString(),
      deployment: {
        tier: 'lightning',
        week: 1,
        fix: 'Complete .next/server removal + E2E tests',
      },
      tests: results,
      performance: {
        totalDurationMs: totalDuration,
      },
    },
    {
      status: allTestsPassed ? 200 : hasErrors ? 500 : 200,
    }
  )
}
