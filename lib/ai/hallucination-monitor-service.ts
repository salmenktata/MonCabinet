/**
 * Service de suivi d'hallucination en production
 *
 * Échantillonne 10% des conversations et évalue la fidélité
 * des réponses via LLM Judge asynchrone.
 *
 * Appelé après chaque réponse chat (fire-and-forget).
 * Résultats stockés dans rag_hallucination_checks.
 *
 * @module lib/ai/hallucination-monitor-service
 */

import { db } from '@/lib/db/postgres'
import { computeFaithfulnessLLM } from './rag-eval-judge'

const SAMPLE_RATE = parseFloat(process.env.HALLUCINATION_SAMPLE_RATE || '0.10')
const ENABLED = process.env.HALLUCINATION_MONITOR !== 'false'

/**
 * Vérifie si cette conversation doit être échantillonnée (10% par défaut)
 */
function shouldSample(): boolean {
  return ENABLED && Math.random() < SAMPLE_RATE
}

/**
 * Lance une vérification d'hallucination asynchrone (fire-and-forget)
 *
 * @param conversationId - ID de la conversation
 * @param messageId - ID du message assistant
 * @param question - Question posée par l'utilisateur
 * @param answer - Réponse générée par le RAG
 * @param sources - Sources retournées (pour extraire les key points)
 * @param model - Modèle utilisé
 */
export function scheduleHallucinationCheck(
  conversationId: string,
  messageId: string | undefined,
  question: string,
  answer: string,
  sources: Array<{ chunkContent?: string; documentName?: string }>,
  model: string
): void {
  if (!shouldSample()) return
  if (model === 'abstained' || model === 'degraded') return

  // Fire-and-forget
  runHallucinationCheck(conversationId, messageId, question, answer, sources, model).catch(err => {
    console.error('[Hallucination Monitor] Erreur:', err instanceof Error ? err.message : err)
  })
}

async function runHallucinationCheck(
  conversationId: string,
  messageId: string | undefined,
  question: string,
  answer: string,
  sources: Array<{ chunkContent?: string; documentName?: string }>,
  model: string
): Promise<void> {
  // Extraire les "key points" des sources pour comparer avec la réponse
  const sourceKeyPoints = sources
    .filter(s => s.chunkContent)
    .slice(0, 5)
    .map(s => s.chunkContent!.substring(0, 200))

  if (sourceKeyPoints.length === 0) return

  try {
    const judgement = await computeFaithfulnessLLM(question, answer, sourceKeyPoints)

    // Stocker le résultat
    await db.query(
      `INSERT INTO rag_hallucination_checks (
        conversation_id, message_id, question, answer_preview,
        sources_count, faithfulness_score, covered_points, total_points,
        reasoning, model, flagged
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        conversationId,
        messageId || null,
        question.substring(0, 500),
        answer.substring(0, 500),
        sources.length,
        judgement.score,
        judgement.coveredPoints,
        judgement.totalPoints,
        judgement.reasoning,
        model,
        judgement.score < 0.5, // Flagged si moins de 50% des points couverts
      ]
    )

    if (judgement.score < 0.5) {
      console.warn(`[Hallucination Monitor] Score faible ${judgement.score.toFixed(2)} pour conversation ${conversationId}`)
    }
  } catch (error) {
    // Silently fail — ne pas impacter le pipeline principal
    console.error('[Hallucination Monitor] Erreur check:', error instanceof Error ? error.message : error)
  }
}

/**
 * Récupère les statistiques d'hallucination pour le monitoring
 */
export async function getHallucinationStats(daysBack: number = 7): Promise<{
  totalChecks: number
  flaggedCount: number
  flaggedRate: number
  avgFaithfulness: number
}> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) as total_checks,
         COUNT(*) FILTER (WHERE flagged = true) as flagged_count,
         ROUND(AVG(faithfulness_score)::numeric, 3) as avg_faithfulness
       FROM rag_hallucination_checks
       WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL`,
      [daysBack]
    )

    const row = result.rows[0]
    const totalChecks = parseInt(row.total_checks) || 0
    const flaggedCount = parseInt(row.flagged_count) || 0

    return {
      totalChecks,
      flaggedCount,
      flaggedRate: totalChecks > 0 ? flaggedCount / totalChecks : 0,
      avgFaithfulness: row.avg_faithfulness ? parseFloat(row.avg_faithfulness) : 0,
    }
  } catch {
    return { totalChecks: 0, flaggedCount: 0, flaggedRate: 0, avgFaithfulness: 0 }
  }
}
