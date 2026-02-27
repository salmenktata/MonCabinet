/**
 * Service de Risk Scoring des réponses RAG
 *
 * Calcule un score de risque (0.0–1.0) pour chaque réponse RAG,
 * basé sur des signaux heuristiques. Les réponses dépassant le seuil
 * sont ajoutées à la expert_review_queue.
 *
 * Signaux de risque :
 * - avg_similarity < 0.40       → +0.30 (sources peu pertinentes)
 * - source unique                → +0.20 (corroboration insuffisante)
 * - conflit entre sources        → +0.25 (sources contradictoires)
 * - source la plus récente > 2a  → +0.15 (sources potentiellement obsolètes)
 * - question à teneur "conseil"  → +0.10 (avis individuel = risque légal)
 * - citation_warnings présents   → +0.15 (citations non vérifiées)
 * - abstention partielle         → +0.20 (quality gate déclenché)
 *
 * Niveau :
 * - low    : score < 0.40
 * - medium : score 0.40–0.64
 * - high   : score >= 0.65 (seuil configurable RAG_HUMAN_REVIEW_THRESHOLD)
 *
 * Toujours appelé en fire-and-forget depuis rag-pipeline.ts.
 *
 * @module lib/ai/risk-scoring-service
 */

import { db } from '@/lib/db/postgres'
import type { ChatSource } from './rag-search-service'

// =============================================================================
// TYPES
// =============================================================================

export type RiskSignalType =
  | 'low_similarity'
  | 'single_source'
  | 'source_conflict'
  | 'source_outdated'
  | 'sensitive_topic'
  | 'citation_warning'
  | 'quality_gate'

export interface RiskSignal {
  type: RiskSignalType
  weight: number   // Contribution au score (0.0–1.0)
  detail: string
}

export interface RiskScore {
  score: number                        // Score total clampé 0.0–1.0
  level: 'low' | 'medium' | 'high'
  signals: RiskSignal[]
}

export interface RiskScoringInput {
  question: string
  answer: string
  sources: ChatSource[]
  avgSimilarity?: number
  citationWarnings?: string[]
  qualityGateTriggered?: boolean
  abstentionReason?: string
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Seuil au-dessus duquel la réponse est ajoutée à la review queue */
const REVIEW_THRESHOLD = parseFloat(process.env.RAG_HUMAN_REVIEW_THRESHOLD || '0.65')
/** Anti-spam : max 10 items/heure dans la review queue */
const MAX_QUEUE_ITEMS_PER_HOUR = parseInt(process.env.RAG_REVIEW_QUEUE_MAX_PER_HOUR || '10')
const ENABLED = process.env.RAG_RISK_SCORING !== 'false'

// =============================================================================
// SCORING
// =============================================================================

/**
 * Calcule le score de risque d'une réponse RAG.
 * Retourne null si le service est désactivé.
 */
export function computeRiskScore(input: RiskScoringInput): RiskScore | null {
  if (!ENABLED) return null

  const signals: RiskSignal[] = []
  let totalWeight = 0

  // Signal 1: Similarité basse
  if (input.avgSimilarity !== undefined && input.avgSimilarity < 0.40) {
    const weight = 0.30
    signals.push({
      type: 'low_similarity',
      weight,
      detail: `Similarité moyenne ${(input.avgSimilarity * 100).toFixed(0)}% < 40%`,
    })
    totalWeight += weight
  }

  // Signal 2: Source unique
  if (input.sources.length === 1) {
    const weight = 0.20
    signals.push({
      type: 'single_source',
      weight,
      detail: 'Une seule source disponible — corroboration insuffisante',
    })
    totalWeight += weight
  }

  // Signal 3: Conflit de branche (sources de domaines différents)
  if (hasSourceConflict(input.sources)) {
    const weight = 0.25
    signals.push({
      type: 'source_conflict',
      weight,
      detail: 'Sources issues de branches juridiques différentes',
    })
    totalWeight += weight
  }

  // Signal 4: Sources potentiellement obsolètes (> 2 ans)
  if (hasOutdatedSources(input.sources)) {
    const weight = 0.15
    signals.push({
      type: 'source_outdated',
      weight,
      detail: 'Sources datant de plus de 2 ans',
    })
    totalWeight += weight
  }

  // Signal 5: Question à teneur "conseil individuel"
  if (isSensitiveTopic(input.question)) {
    const weight = 0.10
    signals.push({
      type: 'sensitive_topic',
      weight,
      detail: 'Question impliquant un conseil juridique individuel',
    })
    totalWeight += weight
  }

  // Signal 6: Avertissements de citation
  if (input.citationWarnings && input.citationWarnings.length > 0) {
    const weight = 0.15
    signals.push({
      type: 'citation_warning',
      weight,
      detail: `${input.citationWarnings.length} citation(s) non vérifiée(s)`,
    })
    totalWeight += weight
  }

  // Signal 7: Quality gate déclenché
  if (input.qualityGateTriggered || input.abstentionReason === 'quality_gate') {
    const weight = 0.20
    signals.push({
      type: 'quality_gate',
      weight,
      detail: 'Quality gate déclenché — sources sous le seuil de confiance',
    })
    totalWeight += weight
  }

  // Clamp le score à [0, 1]
  const score = Math.min(totalWeight, 1.0)
  const level = score >= REVIEW_THRESHOLD ? 'high' : score >= 0.40 ? 'medium' : 'low'

  return { score, level, signals }
}

/**
 * Lance le risk scoring et insère dans la queue si nécessaire.
 * Fire-and-forget.
 */
export function scheduleRiskScoring(
  conversationId: string,
  input: RiskScoringInput
): void {
  if (!ENABLED) return

  runRiskScoring(conversationId, input).catch(err => {
    console.error('[RiskScoring] Erreur:', err instanceof Error ? err.message : err)
  })
}

async function runRiskScoring(
  conversationId: string,
  input: RiskScoringInput
): Promise<void> {
  const riskScore = computeRiskScore(input)
  if (!riskScore) return

  // Logger seulement si high (pour ne pas polluer les logs)
  if (riskScore.level === 'high') {
    console.log(
      `[RiskScoring] ⚠️ High risk score ${riskScore.score.toFixed(2)} conversation ${conversationId}`,
      riskScore.signals.map(s => s.type).join(', ')
    )
  }

  // Ajouter à la review queue si score >= seuil
  if (riskScore.level === 'high') {
    await addToReviewQueue(conversationId, input, riskScore)
  }
}

// =============================================================================
// REVIEW QUEUE
// =============================================================================

async function addToReviewQueue(
  conversationId: string,
  input: RiskScoringInput,
  riskScore: RiskScore
): Promise<void> {
  // Anti-spam : limiter à MAX items/heure
  const recentCount = await db.query(
    `SELECT COUNT(*) as count FROM expert_review_queue
     WHERE created_at >= NOW() - INTERVAL '1 hour'`,
  )
  const count = parseInt(recentCount.rows[0]?.count) || 0
  if (count >= MAX_QUEUE_ITEMS_PER_HOUR) {
    console.warn(`[RiskScoring] Queue pleine (${count}/${MAX_QUEUE_ITEMS_PER_HOUR} items/h) — skip`)
    return
  }

  // Dédupliquer : ne pas rajouter si même conversation déjà dans la queue
  const existing = await db.query(
    `SELECT id FROM expert_review_queue
     WHERE conversation_id = $1 AND status = 'pending'
     LIMIT 1`,
    [conversationId]
  )
  if (existing.rows.length > 0) return

  await db.query(
    `INSERT INTO expert_review_queue (
      conversation_id, question, answer, sources_used,
      risk_score, risk_level, risk_signals,
      avg_similarity, sources_count, quality_indicator, abstention_reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      conversationId || null,
      input.question.substring(0, 2000),
      input.answer.substring(0, 5000),
      JSON.stringify(
        input.sources.slice(0, 10).map(s => ({
          id: (s as any).chunkId,
          title: s.documentName,
          similarity: (s as any).similarity,
        }))
      ),
      riskScore.score,
      riskScore.level,
      JSON.stringify(riskScore.signals),
      input.avgSimilarity || null,
      input.sources.length,
      null,  // quality_indicator
      input.abstentionReason || null,
    ]
  )
}

// =============================================================================
// STATISTIQUES
// =============================================================================

export interface ReviewQueueStats {
  pending: number
  reviewed: number
  dismissed: number
  avgRiskScore: number
  highRiskCount: number
}

export async function getReviewQueueStats(): Promise<ReviewQueueStats> {
  try {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'reviewed') as reviewed,
         COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
         ROUND(AVG(risk_score)::numeric, 3) as avg_risk_score,
         COUNT(*) FILTER (WHERE risk_level = 'high' AND status = 'pending') as high_risk_pending
       FROM expert_review_queue
       WHERE created_at >= NOW() - INTERVAL '30 days'`
    )

    const r = result.rows[0]
    return {
      pending: parseInt(r.pending) || 0,
      reviewed: parseInt(r.reviewed) || 0,
      dismissed: parseInt(r.dismissed) || 0,
      avgRiskScore: parseFloat(r.avg_risk_score) || 0,
      highRiskCount: parseInt(r.high_risk_pending) || 0,
    }
  } catch {
    return { pending: 0, reviewed: 0, dismissed: 0, avgRiskScore: 0, highRiskCount: 0 }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/** Détecte si les sources viennent de branches juridiques différentes */
function hasSourceConflict(sources: ChatSource[]): boolean {
  if (sources.length < 2) return false
  const branches = new Set(
    sources
      .map(s => (s as any).metadata?.branch || (s as any).branch)
      .filter(Boolean)
  )
  return branches.size > 1
}

/** Détecte si des sources sont potentiellement obsolètes (> 2 ans) */
function hasOutdatedSources(sources: ChatSource[]): boolean {
  const twoYearsAgo = Date.now() - 2 * 365 * 24 * 60 * 60 * 1000
  return sources.some(s => {
    const dateStr = (s as any).metadata?.date || (s as any).metadata?.publication_date
    if (!dateStr) return false
    try {
      return new Date(dateStr).getTime() < twoYearsAgo
    } catch {
      return false
    }
  })
}

/** Détecte les questions à teneur "conseil individuel" */
function isSensitiveTopic(question: string): boolean {
  const sensitivePatterns = [
    // FR
    /puis-je|est-ce que je peux|ai-je le droit|dois-je|suis-je obligé/i,
    /que faire|quoi faire|comment faire pour/i,
    /risque[s]?.*si|si je|si j'|responsable/i,
    /conseil|conseiller|recommand/i,
    // AR
    /هل يمكنني|هل علي|ماذا أفعل|هل أنا مسؤول/,
    /كيف أتصرف|ما هو الحل|نصيحة/,
  ]
  return sensitivePatterns.some(p => p.test(question))
}
