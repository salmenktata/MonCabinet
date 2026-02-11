/**
 * Service A/B Testing Prompts (Phase 5.3)
 *
 * Optimisation prompts juridiques via tests A/B :
 * - Control (50%) : IRAC Standard actuel (temp 0.3, 2000 tokens)
 * - Variant A (25%) : IRAC Détaillé (temp 0.1, 3000 tokens)
 * - Variant B (25%) : Socratique (temp 0.4, 2500 tokens)
 *
 * Assignment persistent via hash userId % 100
 * Tracking métriques : satisfaction, citation accuracy, latence, hallucinations
 *
 * @module lib/ai/prompt-ab-testing-service
 */

import { db } from '@/lib/db/postgres'
import crypto from 'crypto'

// =============================================================================
// TYPES
// =============================================================================

export type PromptVariant = 'control' | 'variant_a' | 'variant_b'

export interface VariantConfig {
  name: string
  description: string
  temperature: number
  maxTokens: number
  systemPromptModifier: (basePrompt: string) => string
  weight: number // Pourcentage assignment (0-100)
}

export interface VariantAssignment {
  userId: string
  variant: PromptVariant
  assignedAt: Date
  testName: string
}

export interface VariantMetrics {
  variant: PromptVariant
  totalConversations: number
  totalFeedbacks: number
  satisfactionRate: number // % rating ≥4
  avgRating: number // 1-5
  citationAccuracyRate: number // % citations valides (via feedback)
  avgResponseTime: number // ms
  hallucinationRate: number // % feedbacks avec hallucination signalée
  completionRate: number // % conversations terminées
}

export interface ABTestComparison {
  control: VariantMetrics
  variantA: VariantMetrics | null
  variantB: VariantMetrics | null
  statisticalSignificance: {
    variantA: { pValue: number; significant: boolean; improvement: number } | null
    variantB: { pValue: number; significant: boolean; improvement: number } | null
  }
  recommendations: string[]
  eligibleForPromotion: {
    variantA: boolean
    variantB: boolean
  }
}

// =============================================================================
// CONSTANTES
// =============================================================================

const TEST_NAME = 'legal_prompts_v1'

// Configuration variants
export const VARIANT_CONFIGS: Record<PromptVariant, VariantConfig> = {
  control: {
    name: 'Control - IRAC Standard',
    description: 'Prompt IRAC actuel, équilibré précision/vitesse',
    temperature: 0.3,
    maxTokens: 2000,
    systemPromptModifier: (basePrompt: string) => basePrompt, // Pas de modification
    weight: 50, // 0-49
  },
  variant_a: {
    name: 'Variant A - IRAC Détaillé',
    description:
      'Analyse juridique approfondie, précision maximale, citations exhaustives',
    temperature: 0.1,
    maxTokens: 3000,
    systemPromptModifier: (basePrompt: string) => {
      return (
        basePrompt +
        `\n\n## INSTRUCTIONS VARIANT A - ANALYSE DÉTAILLÉE :\n\n` +
        `1. **Analyse juridique exhaustive** :\n` +
        `   - Identifier TOUS les aspects juridiques pertinents\n` +
        `   - Citer minimum 5 sources différentes (jurisprudence + législation)\n` +
        `   - Expliquer chaque règle de droit en détail avec historique si pertinent\n\n` +
        `2. **Citations précises obligatoires** :\n` +
        `   - Format exact : [Source-N] Article X du Code Y\n` +
        `   - Inclure dates arrêts, numéros décisions, chambres\n` +
        `   - Vérifier cohérence citations avec contexte\n\n` +
        `3. **Structure détaillée** :\n` +
        `   - Problématique : décomposer en sous-questions si complexe\n` +
        `   - Règles : minimum 3 paragraphes par règle majeure\n` +
        `   - Analyse : application détaillée aux faits avec raisonnement étape par étape\n` +
        `   - Conclusion : récapitulatif + actions recommandées précises\n\n` +
        `4. **Qualité > Rapidité** : Privilégier précision et exhaustivité sur concision.`
      )
    },
    weight: 25, // 50-74
  },
  variant_b: {
    name: 'Variant B - Socratique',
    description:
      'Approche par questions guidées, pédagogique, favorise compréhension avocat',
    temperature: 0.4,
    maxTokens: 2500,
    systemPromptModifier: (basePrompt: string) => {
      return (
        basePrompt +
        `\n\n## INSTRUCTIONS VARIANT B - APPROCHE SOCRATIQUE :\n\n` +
        `1. **Raisonnement par questions** :\n` +
        `   - Commencer par reformuler question sous forme "Quelle est la règle applicable ?"\n` +
        `   - Poser 2-3 questions intermédiaires guidant vers solution\n` +
        `   - Répondre à chaque question avant de passer à suivante\n\n` +
        `2. **Dialogue pédagogique** :\n` +
        `   - Expliquer "pourquoi" avant "comment"\n` +
        `   - Anticiper questions avocat et y répondre préventivement\n` +
        `   - Clarifier termes juridiques techniques en langage simple\n\n` +
        `3. **Structure questions/réponses** :\n` +
        `   - Q1: Quel est le cadre juridique général ?\n` +
        `   - Q2: Quelles sont les conditions d'application ?\n` +
        `   - Q3: Comment appliquer au cas concret ?\n` +
        `   - Q4: Quelles sont les conséquences pratiques ?\n\n` +
        `4. **Engagement actif** : Favoriser compréhension profonde via raisonnement guidé.`
      )
    },
    weight: 25, // 75-99
  },
}

// Seuils promotion
const PROMOTION_THRESHOLDS = {
  minConversations: 200,
  minSatisfactionImprovement: 5, // % minimum amélioration satisfaction
  maxPValue: 0.05, // Seuil significativité statistique
}

// =============================================================================
// FONCTION 1 : Assigner Variant à Utilisateur
// =============================================================================

export async function assignVariant(userId: string): Promise<PromptVariant> {
  try {
    // 1. Vérifier si assignment existe déjà
    const existingResult = await db.query(
      `
      SELECT variant
      FROM ab_test_assignments
      WHERE user_id = $1 AND test_name = $2
    `,
      [userId, TEST_NAME]
    )

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0].variant as PromptVariant
    }

    // 2. Calculer variant via hash consistent
    const variant = calculateVariantFromHash(userId)

    // 3. Sauvegarder assignment
    await db.query(
      `
      INSERT INTO ab_test_assignments (user_id, variant, test_name, assigned_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, test_name) DO NOTHING
    `,
      [userId, variant, TEST_NAME]
    )

    console.log(
      `[A/B Test] Nouvel assignment - User ${userId.substring(0, 8)}... → ${variant}`
    )

    return variant
  } catch (error) {
    console.error('[A/B Test] Erreur assignVariant:', error)
    // Fallback : control en cas erreur
    return 'control'
  }
}

// =============================================================================
// FONCTION 2 : Calculer Variant depuis Hash Consistent
// =============================================================================

function calculateVariantFromHash(userId: string): PromptVariant {
  // Hash SHA256 user ID
  const hash = crypto.createHash('sha256').update(userId).digest('hex')

  // Prendre premiers 8 caractères → convertir en nombre
  const hashNum = parseInt(hash.substring(0, 8), 16)

  // Modulo 100 pour distribution uniforme
  const bucket = hashNum % 100

  // Assignment selon poids :
  // Control (50%) : 0-49
  // Variant A (25%) : 50-74
  // Variant B (25%) : 75-99

  if (bucket < 50) {
    return 'control'
  } else if (bucket < 75) {
    return 'variant_a'
  } else {
    return 'variant_b'
  }
}

// =============================================================================
// FONCTION 3 : Récupérer Configuration Variant
// =============================================================================

export async function getVariantConfig(
  userId: string
): Promise<{ variant: PromptVariant; config: VariantConfig }> {
  const variant = await assignVariant(userId)
  const config = VARIANT_CONFIGS[variant]
  return { variant, config }
}

// =============================================================================
// FONCTION 4 : Calculer Métriques Variant
// =============================================================================

export async function calculateVariantMetrics(
  variant: PromptVariant,
  daysBack: number = 30
): Promise<VariantMetrics> {
  try {
    // Récupérer users assignés à ce variant
    const usersResult = await db.query(
      `
      SELECT user_id
      FROM ab_test_assignments
      WHERE variant = $1 AND test_name = $2
    `,
      [variant, TEST_NAME]
    )

    const userIds = usersResult.rows.map(row => row.user_id)

    if (userIds.length === 0) {
      return {
        variant,
        totalConversations: 0,
        totalFeedbacks: 0,
        satisfactionRate: 0,
        avgRating: 0,
        citationAccuracyRate: 0,
        avgResponseTime: 0,
        hallucinationRate: 0,
        completionRate: 0,
      }
    }

    // Métriques depuis rag_feedback
    const metricsResult = await db.query(
      `
      SELECT
        COUNT(*) AS total_feedbacks,
        ROUND(AVG(rating), 2) AS avg_rating,
        ROUND(
          COUNT(*) FILTER (WHERE rating >= 4)::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        ) AS satisfaction_rate,
        ROUND(
          COUNT(*) FILTER (WHERE 'hallucination' = ANY(feedback_type))::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        ) AS hallucination_rate,
        ROUND(
          COUNT(*) FILTER (WHERE 'incorrect_citation' = ANY(feedback_type))::NUMERIC / NULLIF(COUNT(*), 0) * 100,
          1
        ) AS citation_error_rate,
        ROUND(AVG(response_time_ms), 0) AS avg_response_time
      FROM rag_feedback
      WHERE user_id = ANY($1::uuid[])
        AND created_at >= NOW() - ($2 || ' days')::INTERVAL
    `,
      [userIds, daysBack]
    )

    const metrics = metricsResult.rows[0]

    // Citation accuracy = 100 - citation_error_rate
    const citationAccuracyRate = 100 - parseFloat(metrics.citation_error_rate || '0')

    return {
      variant,
      totalConversations: userIds.length, // Approximation
      totalFeedbacks: parseInt(metrics.total_feedbacks, 10),
      satisfactionRate: parseFloat(metrics.satisfaction_rate || '0'),
      avgRating: parseFloat(metrics.avg_rating || '0'),
      citationAccuracyRate,
      avgResponseTime: parseFloat(metrics.avg_response_time || '0'),
      hallucinationRate: parseFloat(metrics.hallucination_rate || '0'),
      completionRate: 100, // Placeholder
    }
  } catch (error) {
    console.error(
      `[A/B Test] Erreur calculateVariantMetrics (${variant}):`,
      error
    )
    throw error
  }
}

// =============================================================================
// FONCTION 5 : Comparer Variants (Analyse Complète)
// =============================================================================

export async function compareVariants(
  daysBack: number = 30
): Promise<ABTestComparison> {
  try {
    console.log(`[A/B Test] Comparaison variants (période ${daysBack}j)...`)

    // 1. Calculer métriques chaque variant
    const [controlMetrics, variantAMetrics, variantBMetrics] =
      await Promise.all([
        calculateVariantMetrics('control', daysBack),
        calculateVariantMetrics('variant_a', daysBack),
        calculateVariantMetrics('variant_b', daysBack),
      ])

    // 2. Tests significativité statistique (Z-test proportions)
    const significanceA = calculateStatisticalSignificance(
      controlMetrics,
      variantAMetrics
    )

    const significanceB = calculateStatisticalSignificance(
      controlMetrics,
      variantBMetrics
    )

    // 3. Vérifier critères promotion
    const eligibleA = checkPromotionEligibility(
      variantAMetrics,
      controlMetrics,
      significanceA
    )

    const eligibleB = checkPromotionEligibility(
      variantBMetrics,
      controlMetrics,
      significanceB
    )

    // 4. Générer recommandations
    const recommendations = generateRecommendations(
      controlMetrics,
      variantAMetrics,
      variantBMetrics,
      significanceA,
      significanceB,
      eligibleA,
      eligibleB
    )

    console.log(
      `[A/B Test] ✅ Comparaison complétée - Eligible promotion: A=${eligibleA}, B=${eligibleB}`
    )

    return {
      control: controlMetrics,
      variantA: variantAMetrics,
      variantB: variantBMetrics,
      statisticalSignificance: {
        variantA: significanceA,
        variantB: significanceB,
      },
      recommendations,
      eligibleForPromotion: {
        variantA: eligibleA,
        variantB: eligibleB,
      },
    }
  } catch (error) {
    console.error('[A/B Test] Erreur compareVariants:', error)
    throw error
  }
}

// =============================================================================
// FONCTION 6 : Test Significativité Statistique (Z-test)
// =============================================================================

function calculateStatisticalSignificance(
  control: VariantMetrics,
  variant: VariantMetrics
): { pValue: number; significant: boolean; improvement: number } | null {
  // Pas assez de données
  if (variant.totalFeedbacks < 50 || control.totalFeedbacks < 50) {
    return null
  }

  // Z-test pour différence proportions (satisfaction rate)
  const p1 = control.satisfactionRate / 100
  const n1 = control.totalFeedbacks
  const p2 = variant.satisfactionRate / 100
  const n2 = variant.totalFeedbacks

  // Pooled proportion
  const pPool = (n1 * p1 + n2 * p2) / (n1 + n2)

  // Standard error
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2))

  // Z-score
  const z = (p2 - p1) / se

  // P-value (approximation normale, test bilatéral)
  const pValue = 2 * (1 - normalCDF(Math.abs(z)))

  // Amélioration en points de pourcentage
  const improvement = variant.satisfactionRate - control.satisfactionRate

  return {
    pValue,
    significant: pValue < PROMOTION_THRESHOLDS.maxPValue,
    improvement,
  }
}

// CDF normale standard (approximation)
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d =
    0.3989423 *
    Math.exp((-z * z) / 2) *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - d : d
}

// =============================================================================
// FONCTION 7 : Vérifier Éligibilité Promotion
// =============================================================================

function checkPromotionEligibility(
  variant: VariantMetrics,
  control: VariantMetrics,
  significance: { pValue: number; significant: boolean; improvement: number } | null
): boolean {
  // Critère 1 : Minimum conversations
  if (variant.totalFeedbacks < PROMOTION_THRESHOLDS.minConversations) {
    return false
  }

  // Critère 2 : Amélioration satisfaction rate
  if (!significance) {
    return false
  }

  if (
    significance.improvement < PROMOTION_THRESHOLDS.minSatisfactionImprovement
  ) {
    return false
  }

  // Critère 3 : Significativité statistique
  if (!significance.significant) {
    return false
  }

  // Critère 4 : Pas de dégradation hallucination rate
  if (variant.hallucinationRate > control.hallucinationRate * 1.2) {
    // +20% tolérance
    return false
  }

  return true
}

// =============================================================================
// FONCTION 8 : Générer Recommandations
// =============================================================================

function generateRecommendations(
  control: VariantMetrics,
  variantA: VariantMetrics,
  variantB: VariantMetrics,
  significanceA: { pValue: number; significant: boolean; improvement: number } | null,
  significanceB: { pValue: number; significant: boolean; improvement: number } | null,
  eligibleA: boolean,
  eligibleB: boolean
): string[] {
  const recommendations: string[] = []

  // Recommandation promotion
  if (eligibleA) {
    recommendations.push(
      `✅ Variant A éligible promotion : +${significanceA!.improvement.toFixed(1)}% satisfaction (p=${significanceA!.pValue.toFixed(3)})`
    )
  } else if (variantA.totalFeedbacks >= 50 && significanceA) {
    if (
      significanceA.improvement < PROMOTION_THRESHOLDS.minSatisfactionImprovement
    ) {
      recommendations.push(
        `⚠️ Variant A amélioration insuffisante (+${significanceA.improvement.toFixed(1)}%, requis +${PROMOTION_THRESHOLDS.minSatisfactionImprovement}%)`
      )
    } else if (!significanceA.significant) {
      recommendations.push(
        `⚠️ Variant A non significatif (p=${significanceA.pValue.toFixed(3)} > 0.05)`
      )
    }
  }

  if (eligibleB) {
    recommendations.push(
      `✅ Variant B éligible promotion : +${significanceB!.improvement.toFixed(1)}% satisfaction (p=${significanceB!.pValue.toFixed(3)})`
    )
  } else if (variantB.totalFeedbacks >= 50 && significanceB) {
    if (
      significanceB.improvement < PROMOTION_THRESHOLDS.minSatisfactionImprovement
    ) {
      recommendations.push(
        `⚠️ Variant B amélioration insuffisante (+${significanceB.improvement.toFixed(1)}%, requis +${PROMOTION_THRESHOLDS.minSatisfactionImprovement}%)`
      )
    } else if (!significanceB.significant) {
      recommendations.push(
        `⚠️ Variant B non significatif (p=${significanceB.pValue.toFixed(3)} > 0.05)`
      )
    }
  }

  // Recommandation collecte données
  if (
    variantA.totalFeedbacks < PROMOTION_THRESHOLDS.minConversations ||
    variantB.totalFeedbacks < PROMOTION_THRESHOLDS.minConversations
  ) {
    recommendations.push(
      `📊 Collecter plus données (requis ${PROMOTION_THRESHOLDS.minConversations} conversations/variant)`
    )
  }

  // Recommandation analyse hallucinations
  if (variantA.hallucinationRate > control.hallucinationRate * 1.2) {
    recommendations.push(
      `⚠️ Variant A taux hallucinations élevé (+${((variantA.hallucinationRate / control.hallucinationRate - 1) * 100).toFixed(0)}%)`
    )
  }

  if (variantB.hallucinationRate > control.hallucinationRate * 1.2) {
    recommendations.push(
      `⚠️ Variant B taux hallucinations élevé (+${((variantB.hallucinationRate / control.hallucinationRate - 1) * 100).toFixed(0)}%)`
    )
  }

  // Recommandation latence
  if (variantA.avgResponseTime > control.avgResponseTime * 1.5) {
    recommendations.push(
      `⏱️ Variant A latence élevée (+${((variantA.avgResponseTime / control.avgResponseTime - 1) * 100).toFixed(0)}%)`
    )
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ Tests en cours - Aucune action requise pour l\'instant')
  }

  return recommendations
}

// =============================================================================
// EXPORT PAR DÉFAUT
// =============================================================================

export default {
  assignVariant,
  getVariantConfig,
  calculateVariantMetrics,
  compareVariants,
  VARIANT_CONFIGS,
}
