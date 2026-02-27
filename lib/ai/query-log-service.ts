/**
 * Service de logging des requêtes RAG en production
 *
 * Persiste chaque requête RAG dans rag_query_log pour alimenter :
 * - L'analyse des Knowledge Gaps (abstentions par domaine)
 * - La génération automatique de Silver test cases
 * - Le Risk Scoring et l'expert review queue
 *
 * Toujours appelé en fire-and-forget (ne bloque JAMAIS le pipeline principal).
 *
 * @module lib/ai/query-log-service
 */

import { db } from '@/lib/db/postgres'
import type { ChatSource } from './rag-search-service'

// =============================================================================
// TYPES
// =============================================================================

export interface QueryLogEntry {
  conversationId?: string
  question: string
  questionLanguage?: string      // 'ar' | 'fr' | 'mixed'
  domain?: string
  routerConfidence?: number
  retrievedChunkIds?: string[]
  retrievedScores?: number[]
  avgSimilarity?: number
  sourcesCount?: number
  qualityGateTriggered?: boolean
  abstentionReason?: string
  answerLength?: number
  qualityIndicator?: 'high' | 'medium' | 'low'
  latencyMs?: number
}

// =============================================================================
// LOGGING
// =============================================================================

const ENABLED = process.env.RAG_QUERY_LOG !== 'false'

/**
 * Enregistre une requête RAG dans rag_query_log.
 * Fire-and-forget : ne jamais awaiter depuis le pipeline principal.
 */
export function scheduleQueryLog(entry: QueryLogEntry): void {
  if (!ENABLED) return

  persistQueryLog(entry).catch(err => {
    // Silently fail — ne pas impacter le pipeline principal
    console.error('[QueryLog] Erreur persistance:', err instanceof Error ? err.message : err)
  })
}

async function persistQueryLog(entry: QueryLogEntry): Promise<void> {
  await db.query(
    `INSERT INTO rag_query_log (
      conversation_id, question, question_language, domain, router_confidence,
      retrieved_chunk_ids, retrieved_scores, avg_similarity, sources_count,
      quality_gate_triggered, abstention_reason, answer_length, quality_indicator,
      latency_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      entry.conversationId || null,
      entry.question.substring(0, 2000),
      entry.questionLanguage || null,
      entry.domain || null,
      entry.routerConfidence || null,
      entry.retrievedChunkIds?.length ? entry.retrievedChunkIds : null,
      entry.retrievedScores?.length ? entry.retrievedScores : null,
      entry.avgSimilarity || null,
      entry.sourcesCount ?? null,
      entry.qualityGateTriggered ?? false,
      entry.abstentionReason || null,
      entry.answerLength || null,
      entry.qualityIndicator || null,
      entry.latencyMs || null,
    ]
  )
}

/**
 * Met à jour le feedback utilisateur sur un log existant.
 * Appelé quand un utilisateur donne son feedback sur un message.
 * Corrèle via conversation_id + question (les deux ensemble sont quasi-uniques).
 */
export async function updateQueryLogFeedback(
  conversationId: string,
  question: string,
  feedback: 'positive' | 'negative',
  feedbackTags?: string[]
): Promise<void> {
  try {
    await db.query(
      `UPDATE rag_query_log
       SET user_feedback = $1, feedback_tags = $2
       WHERE conversation_id = $3
         AND question = $4
         AND created_at > NOW() - INTERVAL '24 hours'
       LIMIT 1`,
      [
        feedback,
        feedbackTags?.length ? feedbackTags : null,
        conversationId,
        question.substring(0, 2000),
      ]
    )
  } catch {
    // Silently fail
  }
}

// =============================================================================
// STATS (pour monitoring)
// =============================================================================

export interface QueryLogStats {
  totalQueries: number
  abstentionRate: number
  avgSimilarity: number
  byDomain: Array<{
    domain: string
    count: number
    abstentionCount: number
    avgSimilarity: number
  }>
}

/**
 * Statistiques agrégées des query logs pour le monitoring dashboard.
 */
export async function getQueryLogStats(daysBack: number = 7): Promise<QueryLogStats> {
  try {
    const [globalResult, domainResult] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) as total_queries,
           COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL) as abstention_count,
           ROUND(AVG(avg_similarity)::numeric, 3) as avg_similarity
         FROM rag_query_log
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL`,
        [daysBack]
      ),
      db.query(
        `SELECT
           COALESCE(domain, 'unknown') as domain,
           COUNT(*) as count,
           COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL) as abstention_count,
           ROUND(AVG(avg_similarity)::numeric, 3) as avg_similarity
         FROM rag_query_log
         WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
         GROUP BY domain
         ORDER BY count DESC
         LIMIT 20`,
        [daysBack]
      ),
    ])

    const global = globalResult.rows[0]
    const totalQueries = parseInt(global.total_queries) || 0
    const abstentionCount = parseInt(global.abstention_count) || 0

    return {
      totalQueries,
      abstentionRate: totalQueries > 0 ? abstentionCount / totalQueries : 0,
      avgSimilarity: parseFloat(global.avg_similarity) || 0,
      byDomain: domainResult.rows.map(r => ({
        domain: r.domain,
        count: parseInt(r.count) || 0,
        abstentionCount: parseInt(r.abstention_count) || 0,
        avgSimilarity: parseFloat(r.avg_similarity) || 0,
      })),
    }
  } catch {
    return { totalQueries: 0, abstentionRate: 0, avgSimilarity: 0, byDomain: [] }
  }
}
