/**
 * Service Feedback Loop Dynamique
 *
 * Exploite la table chat_message_feedback pour ajuster dynamiquement
 * les boost factors des différents types de sources RAG.
 *
 * Le système:
 * 1. Analyse les feedbacks par type de source
 * 2. Calcule des ajustements de boost basés sur le taux de satisfaction
 * 3. Met en cache les boosts ajustés (TTL 24h)
 * 4. Expose une API pour récupérer les boosts dynamiques
 */

import { db } from '@/lib/db/postgres'
import { getRedisClient, isRedisAvailable, CACHE_TTL } from '@/lib/cache/redis'
import { SOURCE_BOOST } from './config'

// =============================================================================
// CONFIGURATION
// =============================================================================

const FEEDBACK_BOOST_ENABLED = process.env.FEEDBACK_BOOST_ENABLED !== 'false'
const MIN_FEEDBACK_COUNT = parseInt(process.env.FEEDBACK_MIN_COUNT || '10', 10)
const BOOST_ADJUSTMENT_FACTOR = parseFloat(process.env.BOOST_ADJUSTMENT_FACTOR || '0.1')

// Clé Redis pour le cache des boosts
const FEEDBACK_BOOST_KEY = 'feedback:boost_factors'

// =============================================================================
// TYPES
// =============================================================================

export interface FeedbackStats {
  sourceType: string
  totalFeedback: number
  positiveFeedback: number
  negativeFeedback: number
  positiveRate: number
}

export interface DynamicBoostFactors {
  factors: Record<string, number>
  lastUpdated: Date | null
  feedbackStats: FeedbackStats[]
}

interface SourceFeedbackRow {
  source_type: string
  total: string
  positive: string
  negative: string
}

// =============================================================================
// ANALYSE DU FEEDBACK
// =============================================================================

/**
 * Récupère les statistiques de feedback par type de source
 * Analyse les métadonnées des messages pour extraire le type de source
 */
export async function getFeedbackStatsBySourceType(): Promise<FeedbackStats[]> {
  const result = await db.query(`
    WITH message_sources AS (
      SELECT
        m.id as message_id,
        COALESCE(
          (m.sources::jsonb -> 0 -> 'metadata' ->> 'type'),
          (m.sources::jsonb -> 0 -> 'metadata' ->> 'category'),
          'document'
        ) as source_type
      FROM chat_messages m
      WHERE m.role = 'assistant'
        AND m.sources IS NOT NULL
        AND jsonb_array_length(m.sources::jsonb) > 0
    ),
    feedback_by_source AS (
      SELECT
        ms.source_type,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE f.rating = 'positive') as positive,
        COUNT(*) FILTER (WHERE f.rating = 'negative') as negative
      FROM chat_message_feedback f
      JOIN message_sources ms ON f.message_id = ms.message_id
      GROUP BY ms.source_type
    )
    SELECT * FROM feedback_by_source
    ORDER BY total DESC
  `)

  return result.rows.map((row: SourceFeedbackRow) => ({
    sourceType: row.source_type,
    totalFeedback: parseInt(row.total),
    positiveFeedback: parseInt(row.positive),
    negativeFeedback: parseInt(row.negative),
    positiveRate: parseInt(row.total) > 0
      ? parseInt(row.positive) / parseInt(row.total)
      : 0.5,
  }))
}

/**
 * Calcule les boost factors dynamiques basés sur le feedback
 * Formule: newBoost = baseBoost * (1 + adjustment)
 * adjustment = (positiveRate - 0.5) * BOOST_ADJUSTMENT_FACTOR
 *
 * Exemple:
 * - positiveRate = 0.8 → adjustment = 0.3 * 0.1 = +0.03 → boost augmenté
 * - positiveRate = 0.3 → adjustment = -0.2 * 0.1 = -0.02 → boost diminué
 */
export function calculateDynamicBoosts(
  stats: FeedbackStats[],
  baseBoosts: Record<string, number> = SOURCE_BOOST
): Record<string, number> {
  const dynamicBoosts = { ...baseBoosts }

  for (const stat of stats) {
    // Ignorer si pas assez de feedback
    if (stat.totalFeedback < MIN_FEEDBACK_COUNT) {
      continue
    }

    const sourceType = stat.sourceType
    const baseBoost = baseBoosts[sourceType] || baseBoosts.autre || 1.0

    // Calculer l'ajustement: déviation par rapport à 50% * facteur
    const adjustment = (stat.positiveRate - 0.5) * BOOST_ADJUSTMENT_FACTOR * 2

    // Appliquer l'ajustement avec limites (min 0.5, max 1.5 du boost de base)
    const newBoost = baseBoost * (1 + adjustment)
    dynamicBoosts[sourceType] = Math.max(
      baseBoost * 0.5,
      Math.min(baseBoost * 1.5, newBoost)
    )

    console.log(`[Feedback] ${sourceType}: ${stat.positiveFeedback}/${stat.totalFeedback} positive (${(stat.positiveRate * 100).toFixed(1)}%) → boost ${baseBoost.toFixed(2)} → ${dynamicBoosts[sourceType].toFixed(2)}`)
  }

  return dynamicBoosts
}

// =============================================================================
// CACHE REDIS
// =============================================================================

/**
 * Récupère les boost factors du cache
 */
async function getCachedBoostFactors(): Promise<DynamicBoostFactors | null> {
  if (!isRedisAvailable()) {
    return null
  }

  try {
    const client = await getRedisClient()
    if (!client) return null

    const cached = await client.get(FEEDBACK_BOOST_KEY)
    if (!cached) return null

    const data = JSON.parse(cached)
    return {
      factors: data.factors,
      lastUpdated: data.lastUpdated ? new Date(data.lastUpdated) : null,
      feedbackStats: data.feedbackStats,
    }
  } catch (error) {
    console.warn('[Feedback] Erreur lecture cache:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Met en cache les boost factors
 */
async function setCachedBoostFactors(data: DynamicBoostFactors): Promise<void> {
  if (!isRedisAvailable()) {
    return
  }

  try {
    const client = await getRedisClient()
    if (!client) return

    await client.setEx(
      FEEDBACK_BOOST_KEY,
      CACHE_TTL.feedbackBoost,
      JSON.stringify({
        factors: data.factors,
        lastUpdated: data.lastUpdated?.toISOString(),
        feedbackStats: data.feedbackStats,
      })
    )

    console.log(`[Feedback] Boost factors mis en cache (TTL: ${CACHE_TTL.feedbackBoost}s)`)
  } catch (error) {
    console.warn('[Feedback] Erreur écriture cache:', error instanceof Error ? error.message : error)
  }
}

// =============================================================================
// API PUBLIQUE
// =============================================================================

/**
 * Récupère les boost factors dynamiques (avec cache)
 * Utilise le cache si disponible, sinon calcule et met en cache
 */
export async function getDynamicBoostFactors(): Promise<DynamicBoostFactors> {
  // Si désactivé, retourner les boosts statiques
  if (!FEEDBACK_BOOST_ENABLED) {
    return {
      factors: SOURCE_BOOST,
      lastUpdated: null,
      feedbackStats: [],
    }
  }

  // Vérifier le cache
  const cached = await getCachedBoostFactors()
  if (cached) {
    return cached
  }

  // Calculer les nouveaux boosts
  const stats = await getFeedbackStatsBySourceType()
  const factors = calculateDynamicBoosts(stats)

  const result: DynamicBoostFactors = {
    factors,
    lastUpdated: new Date(),
    feedbackStats: stats,
  }

  // Mettre en cache
  await setCachedBoostFactors(result)

  return result
}

/**
 * Force le recalcul des boost factors (invalide le cache)
 */
export async function refreshDynamicBoostFactors(): Promise<DynamicBoostFactors> {
  // Calculer les nouveaux boosts
  const stats = await getFeedbackStatsBySourceType()
  const factors = calculateDynamicBoosts(stats)

  const result: DynamicBoostFactors = {
    factors,
    lastUpdated: new Date(),
    feedbackStats: stats,
  }

  // Mettre en cache
  await setCachedBoostFactors(result)

  console.log('[Feedback] Boost factors rafraîchis:', Object.entries(factors)
    .map(([k, v]) => `${k}:${v.toFixed(2)}`)
    .join(', '))

  return result
}

/**
 * Récupère les statistiques de feedback globales
 */
export async function getGlobalFeedbackStats(): Promise<{
  totalFeedback: number
  positiveCount: number
  negativeCount: number
  positiveRate: number
  topNegativeReasons: Array<{ reason: string; count: number }>
}> {
  const result = await db.query(`SELECT * FROM get_feedback_stats()`)

  if (result.rows.length === 0) {
    return {
      totalFeedback: 0,
      positiveCount: 0,
      negativeCount: 0,
      positiveRate: 0,
      topNegativeReasons: [],
    }
  }

  const row = result.rows[0]
  return {
    totalFeedback: parseInt(row.total_feedback) || 0,
    positiveCount: parseInt(row.positive_count) || 0,
    negativeCount: parseInt(row.negative_count) || 0,
    positiveRate: parseFloat(row.positive_percentage) / 100 || 0,
    topNegativeReasons: row.top_negative_reasons || [],
  }
}

/**
 * Vérifie si le système de feedback dynamique est activé
 */
export function isFeedbackBoostEnabled(): boolean {
  return FEEDBACK_BOOST_ENABLED
}
