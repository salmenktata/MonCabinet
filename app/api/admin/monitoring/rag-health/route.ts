import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getErrorMessage } from '@/lib/utils/error-utils'

/**
 * GET /api/admin/monitoring/rag-health
 * 
 * Métriques santé RAG avancées:
 * - Embeddings consistency (OpenAI vs Ollama)
 * - Query success rate
 * - Threshold violations
 * - Dimension mismatch incidents
 */
export async function GET() {
  try {
    // 1. Embeddings consistency (OpenAI vs Ollama vs Gemini ratio)
    const embeddingsStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) as openai_count,
        COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL AND kbc.embedding_openai IS NULL) as ollama_count,
        COUNT(*) FILTER (WHERE kbc.embedding_gemini IS NOT NULL) as gemini_count,
        COUNT(*) as total_chunks
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
    `)

    const openaiCount = parseInt(embeddingsStats.rows[0]?.openai_count || '0', 10)
    const ollamaCount = parseInt(embeddingsStats.rows[0]?.ollama_count || '0', 10)
    const geminiCount = parseInt(embeddingsStats.rows[0]?.gemini_count || '0', 10)
    const totalChunks = parseInt(embeddingsStats.rows[0]?.total_chunks || '0', 10)

    // 2. Query success rate 24h/7j (depuis chat_messages)
    // tokens_used > 0 = réponse LLM réelle, 0 = pas de sources trouvées, NULL = erreur
    // Dénominateur = total messages assistant (cohérent avec le numérateur)
    const queryStats24h = await db.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE tokens_used > 0) as successful_queries,
        COUNT(*) FILTER (WHERE tokens_used IS NULL OR tokens_used = 0) as failed_queries
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '24 hours'
        AND role = 'assistant'
    `)

    const queryStats7d = await db.query(`
      SELECT
        COUNT(*) as total_queries,
        COUNT(*) FILTER (WHERE tokens_used > 0) as successful_queries,
        COUNT(*) FILTER (WHERE tokens_used IS NULL OR tokens_used = 0) as failed_queries
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND role = 'assistant'
    `)

    const queries24h = {
      total: parseInt(queryStats24h.rows[0]?.total_queries || '0', 10),
      successful: parseInt(queryStats24h.rows[0]?.successful_queries || '0', 10),
      failed: parseInt(queryStats24h.rows[0]?.failed_queries || '0', 10),
    }

    const queries7d = {
      total: parseInt(queryStats7d.rows[0]?.total_queries || '0', 10),
      successful: parseInt(queryStats7d.rows[0]?.successful_queries || '0', 10),
      failed: parseInt(queryStats7d.rows[0]?.failed_queries || '0', 10),
    }

    // 3. Timeline query success rate (7 derniers jours)
    // total = nb réponses assistant, successful = celles avec tokens_used > 0
    const timeline = await db.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tokens_used > 0) as successful
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND role = 'assistant'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `)

    // 4. Threshold violations (chunks avec similarité < 0.3 dans dernières recherches)
    // Note: On n'a pas de table pour tracker ça, donc on simule avec 0 pour l'instant
    const thresholdViolations = 0

    // 5. Dimension mismatch incidents (détecté via cron_executions)
    const incidents = await db.query(`
      SELECT COUNT(*) as count
      FROM cron_executions
      WHERE cron_name = 'check-rag-config'
        AND status = 'failed'
        AND created_at >= NOW() - INTERVAL '7 days'
    `)

    const dimensionMismatchCount = parseInt(incidents.rows[0]?.count || '0', 10)

    // Calculer ratios et taux de succès
    const openaiRatio = totalChunks > 0 ? (openaiCount / totalChunks) * 100 : 0
    const ollamaRatio = totalChunks > 0 ? (ollamaCount / totalChunks) * 100 : 0
    const geminiRatio = totalChunks > 0 ? (geminiCount / totalChunks) * 100 : 0
    const successRate24h = queries24h.total > 0 ? (queries24h.successful / queries24h.total) * 100 : 100
    const successRate7d = queries7d.total > 0 ? (queries7d.successful / queries7d.total) * 100 : 100

    return NextResponse.json({
      success: true,
      data: {
        embeddings: {
          openai: openaiCount,
          ollama: ollamaCount,
          gemini: geminiCount,
          total: totalChunks,
          openaiRatio: Math.round(openaiRatio * 100) / 100,
          ollamaRatio: Math.round(ollamaRatio * 100) / 100,
          geminiRatio: Math.round(geminiRatio * 100) / 100,
        },
        queries: {
          '24h': {
            ...queries24h,
            successRate: Math.round(successRate24h * 100) / 100,
          },
          '7d': {
            ...queries7d,
            successRate: Math.round(successRate7d * 100) / 100,
          },
        },
        timeline: timeline.rows.map(row => ({
          date: row.date,
          total: parseInt(row.total, 10),
          successful: parseInt(row.successful, 10),
          successRate: row.total > 0 ? Math.round((parseInt(row.successful, 10) / parseInt(row.total, 10)) * 10000) / 100 : 100,
        })),
        violations: {
          thresholdViolations,
          dimensionMismatch: dimensionMismatchCount,
        },
        alerts: {
          hasMismatch: dimensionMismatchCount > 0,
          lowSuccessRate: successRate24h < 90,
        },
      },
    })
  } catch (error) {
    console.error('[RAG Health API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error) || 'Failed to fetch RAG health metrics',
      },
      { status: 500 }
    )
  }
}
