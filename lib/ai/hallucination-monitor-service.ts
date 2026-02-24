/**
 * Service de suivi d'hallucination en production
 *
 * Échantillonne 25% des conversations (P2 fix Feb 24, 2026 : augmenté de 10% → 25%)
 * et évalue la fidélité des réponses via LLM Judge asynchrone.
 * Alerte email si taux d'hallucination > 15% sur fenêtre 24h.
 *
 * Appelé après chaque réponse chat (fire-and-forget).
 * Résultats stockés dans rag_hallucination_checks.
 *
 * @module lib/ai/hallucination-monitor-service
 */

import { db } from '@/lib/db/postgres'
import { computeFaithfulnessLLM } from './rag-eval-judge'
import { getRedisClient } from '@/lib/cache/redis'
import { sendEmail } from '@/lib/email/brevo'

const SAMPLE_RATE = parseFloat(process.env.HALLUCINATION_SAMPLE_RATE || '0.25')
const ENABLED = process.env.HALLUCINATION_MONITOR !== 'false'

/** Seuil d'alerte email : taux hallucination > 15% sur 24h */
const ALERT_THRESHOLD = parseFloat(process.env.HALLUCINATION_ALERT_THRESHOLD || '0.15')
/** Anti-spam : max 1 alerte / 6h */
const ALERT_ANTI_SPAM_TTL = 6 * 60 * 60

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

    // Vérifier si le taux d'hallucination 24h dépasse le seuil d'alerte (fire-and-forget)
    checkAndAlertHallucinationRate().catch(() => {})
  } catch (error) {
    // Silently fail — ne pas impacter le pipeline principal
    console.error('[Hallucination Monitor] Erreur check:', error instanceof Error ? error.message : error)
  }
}

/**
 * Vérifie le taux d'hallucination sur les dernières 24h.
 * Envoie une alerte email si le taux dépasse ALERT_THRESHOLD (anti-spam 6h).
 */
async function checkAndAlertHallucinationRate(): Promise<void> {
  try {
    const stats = await getHallucinationStats(1)
    if (stats.totalChecks < 5) return // Pas assez de données

    if (stats.flaggedRate > ALERT_THRESHOLD) {
      // Anti-spam Redis
      const redis = await getRedisClient()
      const SPAM_KEY = 'alert:hallucination:last_sent'
      if (redis) {
        const lastSent = await redis.get(SPAM_KEY)
        if (lastSent) return
        await redis.set(SPAM_KEY, new Date().toISOString(), { EX: ALERT_ANTI_SPAM_TTL })
      }

      const ALERT_EMAIL = process.env.ALERT_EMAIL || 'admin@qadhya.tn'
      const ratePct = (stats.flaggedRate * 100).toFixed(1)
      const thresholdPct = (ALERT_THRESHOLD * 100).toFixed(0)

      await sendEmail({
        to: ALERT_EMAIL,
        subject: `[ALERTE] Taux hallucination élevé : ${ratePct}% (seuil ${thresholdPct}%)`,
        htmlContent: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#dc2626;color:white;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">🚨 Taux d'hallucination élevé — Qadhya RAG</h2>
            </div>
            <div style="background:#f9fafb;padding:20px;border-radius:0 0 8px 8px">
              <p><strong>Taux hallucination (24h) :</strong> ${ratePct}% (seuil : ${thresholdPct}%)</p>
              <p><strong>Checks effectués :</strong> ${stats.totalChecks}</p>
              <p><strong>Réponses flaggées :</strong> ${stats.flaggedCount}</p>
              <p><strong>Fidélité moyenne :</strong> ${stats.avgFaithfulness.toFixed(3)}</p>
              <p style="margin-top:16px">Vérifier <code>/super-admin/monitoring</code> pour le détail.</p>
              <p style="font-size:12px;color:#6b7280">Qadhya Monitoring — ${new Date().toISOString()}</p>
            </div>
          </div>`,
        tags: ['hallucination-alert'],
      })

      console.warn(`[Hallucination Monitor] 🚨 Alerte envoyée : taux ${ratePct}% > seuil ${thresholdPct}%`)
    }
  } catch {
    // Silently fail
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
