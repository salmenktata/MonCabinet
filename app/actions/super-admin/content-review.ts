'use server'

/**
 * Server Actions pour la revue de contenu
 * Utilisées par l'interface super-admin pour valider/rejeter le contenu
 */

import { revalidatePath } from 'next/cache'
import {
  getReviewQueue as getQueue,
  getReviewItem as getItem,
  completeReview as complete,
  skipReview,
  claimNextReview,
  getReviewStats as getStats,
  getReviewHistory,
  getPendingCountForUser,
  reassignReview,
  type ReviewQueueOptions,
  type ReviewDecisionInput,
} from '@/lib/web-scraper/human-review-service'
import {
  getContradictions as getContradictionsList,
  resolveContradiction,
  getContradictionStats,
} from '@/lib/web-scraper/contradiction-detector-service'
import {
  getClassification,
  validateClassification as validateClass,
  getClassificationsRequiringValidation,
} from '@/lib/web-scraper/legal-classifier-service'
import {
  getQualityAssessment,
  getAssessmentsRequiringReview,
} from '@/lib/web-scraper/content-analyzer-service'
import { getPipelineStats } from '@/lib/web-scraper/intelligent-pipeline-service'
import { db } from '@/lib/db/postgres'
import type {
  HumanReviewItem,
  ReviewQueueStats,
  ContentContradiction,
  LegalClassification,
  ContentQualityAssessment,
  IntelligentPipelineStats,
  ReviewStatus,
  ReviewType,
  ReviewPriority,
  ReviewDecision,
  ContradictionStatus,
  ContradictionSeverity,
  LegalDomain,
  LegalContentCategory,
  DocumentNature,
} from '@/lib/web-scraper/types'

// =============================================================================
// QUEUE DE REVUE
// =============================================================================

/**
 * Récupère la queue de revue avec filtres
 */
export async function getReviewQueue(options: {
  status?: ReviewStatus[]
  reviewTypes?: ReviewType[]
  priority?: ReviewPriority[]
  assignedTo?: string
  limit?: number
  offset?: number
}): Promise<{
  items: HumanReviewItem[]
  total: number
}> {
  const items = await getQueue(options)

  // Compter le total pour la pagination
  let countQuery = `
    SELECT COUNT(*) FROM human_review_queue WHERE 1=1
  `
  const params: (string | string[])[] = []
  let paramIndex = 1

  if (options.status && options.status.length > 0) {
    countQuery += ` AND status = ANY($${paramIndex++})`
    params.push(options.status)
  }
  if (options.reviewTypes && options.reviewTypes.length > 0) {
    countQuery += ` AND review_type = ANY($${paramIndex++})`
    params.push(options.reviewTypes)
  }
  if (options.priority && options.priority.length > 0) {
    countQuery += ` AND priority = ANY($${paramIndex++})`
    params.push(options.priority)
  }
  if (options.assignedTo) {
    countQuery += ` AND assigned_to = $${paramIndex++}`
    params.push(options.assignedTo)
  }
  countQuery += ` AND (expires_at IS NULL OR expires_at > NOW())`

  const countResult = await db.query<{ count: string }>(countQuery, params)
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  return { items, total }
}

/**
 * Récupère un item de revue par ID avec détails complets
 */
export async function getReviewItemDetails(reviewId: string): Promise<{
  review: HumanReviewItem | null
  targetDetails: {
    page?: { id: string; url: string; title: string | null; content: string | null }
    quality?: ContentQualityAssessment | null
    classification?: LegalClassification | null
    contradictions?: ContentContradiction[]
  }
}> {
  const review = await getItem(reviewId)

  if (!review) {
    return { review: null, targetDetails: {} }
  }

  const targetDetails: {
    page?: { id: string; url: string; title: string | null; content: string | null }
    quality?: ContentQualityAssessment | null
    classification?: LegalClassification | null
    contradictions?: ContentContradiction[]
  } = {}

  // Récupérer les détails selon le type de cible
  if (review.targetType === 'web_page') {
    const pageResult = await db.query<{
      id: string
      url: string
      title: string | null
      extracted_text: string | null
    }>(
      `SELECT id, url, title, extracted_text FROM web_pages WHERE id = $1`,
      [review.targetId]
    )

    if (pageResult.rows.length > 0) {
      targetDetails.page = {
        id: pageResult.rows[0].id,
        url: pageResult.rows[0].url,
        title: pageResult.rows[0].title,
        content: pageResult.rows[0].extracted_text,
      }
    }

    // Récupérer l'évaluation de qualité
    targetDetails.quality = await getQualityAssessment(review.targetId)

    // Récupérer la classification
    targetDetails.classification = await getClassification(review.targetId)

    // Récupérer les contradictions
    const contradictions = await getContradictionsList({
      status: ['pending', 'under_review'],
      limit: 10,
    })
    targetDetails.contradictions = contradictions.filter(
      (c) => c.sourcePageId === review.targetId || c.targetPageId === review.targetId
    )
  }

  return { review, targetDetails }
}

/**
 * Réclame le prochain item à traiter
 */
export async function claimNextReviewItem(
  userId: string,
  options?: {
    reviewTypes?: ReviewType[]
    minPriority?: ReviewPriority
  }
): Promise<HumanReviewItem | null> {
  const item = await claimNextReview(userId, options)
  if (item) {
    revalidatePath('/super-admin/content-review')
  }
  return item
}

/**
 * Complète une revue avec une décision
 */
export async function completeReviewAction(
  reviewId: string,
  userId: string,
  decision: {
    decision: ReviewDecision
    notes?: string
    modifications?: Record<string, unknown>
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const success = await complete(reviewId, userId, decision)

    if (success) {
      revalidatePath('/super-admin/content-review')
      revalidatePath(`/super-admin/content-review/${reviewId}`)
    }

    return { success }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Passe un item de revue
 */
export async function skipReviewAction(
  reviewId: string,
  userId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await skipReview(reviewId, userId, reason)
    revalidatePath('/super-admin/content-review')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Réassigne un item de revue
 */
export async function reassignReviewAction(
  reviewId: string,
  newAssigneeId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await reassignReview(reviewId, newAssigneeId)
    revalidatePath('/super-admin/content-review')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Récupère les statistiques de la queue
 */
export async function getReviewQueueStats(): Promise<ReviewQueueStats> {
  return getStats()
}

/**
 * Récupère le nombre d'items en attente pour un utilisateur
 */
export async function getUserReviewCounts(userId: string): Promise<{
  assigned: number
  available: number
}> {
  return getPendingCountForUser(userId)
}

/**
 * Récupère l'historique des revues
 */
export async function getReviewHistoryAction(options: {
  userId?: string
  limit?: number
  offset?: number
}): Promise<HumanReviewItem[]> {
  return getReviewHistory(options)
}

// =============================================================================
// CONTRADICTIONS
// =============================================================================

/**
 * Récupère la liste des contradictions
 */
export async function getContradictions(options?: {
  status?: ContradictionStatus[]
  severity?: ContradictionSeverity[]
  limit?: number
  offset?: number
}): Promise<{
  items: ContentContradiction[]
  total: number
}> {
  const items = await getContradictionsList(options || {})

  // Compter le total
  let countQuery = `SELECT COUNT(*) FROM content_contradictions WHERE 1=1`
  const params: (string | string[])[] = []
  let paramIndex = 1

  if (options?.status && options.status.length > 0) {
    countQuery += ` AND status = ANY($${paramIndex++})`
    params.push(options.status)
  }
  if (options?.severity && options.severity.length > 0) {
    countQuery += ` AND severity = ANY($${paramIndex++})`
    params.push(options.severity)
  }

  const countResult = await db.query<{ count: string }>(countQuery, params)
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  return { items, total }
}

/**
 * Résout une contradiction
 */
export async function resolveContradictionAction(
  contradictionId: string,
  userId: string,
  resolution: {
    status: 'resolved' | 'dismissed'
    notes: string
    action?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await resolveContradiction(contradictionId, userId, resolution)
    revalidatePath('/super-admin/contradictions')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Récupère les statistiques des contradictions
 */
export async function getContradictionsStats() {
  return getContradictionStats()
}

// =============================================================================
// CLASSIFICATIONS
// =============================================================================

/**
 * Valide une classification
 */
export async function validateClassificationAction(
  classificationId: string,
  userId: string,
  finalClassification: {
    primaryCategory: LegalContentCategory
    subcategory?: string
    domain?: LegalDomain
    subdomain?: string
    documentNature?: DocumentNature
  },
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await validateClass(classificationId, userId, finalClassification, notes)
    revalidatePath('/super-admin/content-review')
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}

/**
 * Récupère les classifications en attente de validation
 */
export async function getPendingClassifications(options?: {
  limit?: number
  offset?: number
  domain?: LegalDomain
}): Promise<LegalClassification[]> {
  return getClassificationsRequiringValidation(options || {})
}

// =============================================================================
// QUALITÉ
// =============================================================================

/**
 * Récupère les évaluations de qualité nécessitant une revue
 */
export async function getPendingQualityAssessments(options?: {
  limit?: number
  offset?: number
  minScore?: number
  maxScore?: number
}): Promise<ContentQualityAssessment[]> {
  return getAssessmentsRequiringReview(options || {})
}

// =============================================================================
// STATISTIQUES GLOBALES
// =============================================================================

/**
 * Récupère les statistiques du pipeline intelligent
 */
export async function getIntelligentPipelineStats(): Promise<IntelligentPipelineStats> {
  return getPipelineStats()
}

/**
 * Récupère un dashboard complet des statistiques
 */
export async function getContentReviewDashboard(): Promise<{
  pipeline: IntelligentPipelineStats
  queue: ReviewQueueStats
  contradictions: {
    total: number
    pending: number
    bySeverity: Record<string, number>
  }
}> {
  const [pipeline, queue, contradictions] = await Promise.all([
    getPipelineStats(),
    getStats(),
    getContradictionStats(),
  ])

  return {
    pipeline,
    queue,
    contradictions: {
      total: contradictions.total,
      pending: contradictions.pending,
      bySeverity: contradictions.bySeverity,
    },
  }
}
