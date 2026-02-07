/**
 * Service de gestion de la queue de revue humaine
 *
 * Gère les demandes de validation par le super-admin:
 * - Création de demandes de revue
 * - Attribution et traitement des revues
 * - Statistiques et métriques
 */

import { db } from '@/lib/db/postgres'
import type {
  HumanReviewItem,
  ReviewType,
  ReviewTargetType,
  ReviewPriority,
  ReviewStatus,
  ReviewDecision,
  ReviewQueueStats,
  SuggestedAction,
} from './types'

// =============================================================================
// TYPES
// =============================================================================

export interface CreateReviewRequest {
  reviewType: ReviewType
  targetType: ReviewTargetType
  targetId: string
  title: string
  description?: string
  context?: Record<string, unknown>
  suggestedActions?: SuggestedAction[]
  priority?: ReviewPriority
  qualityScore?: number
  confidenceScore?: number
  expiresAt?: Date
}

export interface ReviewDecisionInput {
  decision: ReviewDecision
  notes?: string
  modifications?: Record<string, unknown>
}

export interface ReviewQueueOptions {
  status?: ReviewStatus[]
  reviewTypes?: ReviewType[]
  priority?: ReviewPriority[]
  assignedTo?: string
  limit?: number
  offset?: number
}

// =============================================================================
// FONCTIONS PRINCIPALES
// =============================================================================

/**
 * Crée une nouvelle demande de revue
 */
export async function createReviewRequest(
  request: CreateReviewRequest
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `SELECT create_review_request(
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    ) as id`,
    [
      request.reviewType,
      request.targetType,
      request.targetId,
      request.title,
      request.description || null,
      JSON.stringify(request.context || {}),
      request.priority || 'normal',
      request.qualityScore || null,
      request.confidenceScore || null,
      JSON.stringify(request.suggestedActions || []),
    ]
  )

  const reviewId = result.rows[0].id

  // Créer une notification admin si priorité haute ou urgente
  if (request.priority === 'high' || request.priority === 'urgent') {
    await createAdminNotification(reviewId, request)
  }

  return reviewId
}

/**
 * Récupère la queue de revue avec filtres
 */
export async function getReviewQueue(
  options: ReviewQueueOptions = {}
): Promise<HumanReviewItem[]> {
  const {
    status,
    reviewTypes,
    priority,
    assignedTo,
    limit = 50,
    offset = 0,
  } = options

  let query = `SELECT * FROM human_review_queue WHERE 1=1`
  const params: (string | number | string[])[] = []
  let paramIndex = 1

  if (status && status.length > 0) {
    query += ` AND status = ANY($${paramIndex++})`
    params.push(status)
  }

  if (reviewTypes && reviewTypes.length > 0) {
    query += ` AND review_type = ANY($${paramIndex++})`
    params.push(reviewTypes)
  }

  if (priority && priority.length > 0) {
    query += ` AND priority = ANY($${paramIndex++})`
    params.push(priority)
  }

  if (assignedTo) {
    query += ` AND assigned_to = $${paramIndex++}`
    params.push(assignedTo)
  }

  // Filtrer les items expirés
  query += ` AND (expires_at IS NULL OR expires_at > NOW())`

  query += ` ORDER BY
    CASE priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at ASC
  `
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
  params.push(limit, offset)

  const result = await db.query(query, params)
  return result.rows.map(mapRowToReviewItem)
}

/**
 * Récupère un item de revue par ID
 */
export async function getReviewItem(
  reviewId: string
): Promise<HumanReviewItem | null> {
  const result = await db.query(
    `SELECT * FROM human_review_queue WHERE id = $1`,
    [reviewId]
  )

  if (result.rows.length === 0) {
    return null
  }

  return mapRowToReviewItem(result.rows[0])
}

/**
 * Réclame le prochain item de revue disponible
 */
export async function claimNextReview(
  userId: string,
  options: {
    reviewTypes?: ReviewType[]
    minPriority?: ReviewPriority
  } = {}
): Promise<HumanReviewItem | null> {
  const result = await db.query(
    `SELECT * FROM claim_next_review_item($1, $2, $3)`,
    [
      userId,
      options.reviewTypes || null,
      options.minPriority || 'low',
    ]
  )

  if (result.rows.length === 0 || !result.rows[0].review_id) {
    return null
  }

  // Mapper le résultat de la fonction
  const row = result.rows[0]
  return {
    id: row.review_id,
    reviewType: row.review_type,
    targetType: row.target_type,
    targetId: row.target_id,
    title: row.title,
    description: row.description,
    context: row.context || {},
    suggestedActions: row.suggested_actions || [],
    qualityScore: row.quality_score,
    confidenceScore: row.confidence_score,
    priority: row.priority,
    status: 'assigned',
    assignedTo: userId,
    assignedAt: new Date(),
    decision: null,
    decisionNotes: null,
    modificationsMade: {},
    completedBy: null,
    completedAt: null,
    timeToDecisionMs: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Complète une revue avec une décision
 */
export async function completeReview(
  reviewId: string,
  userId: string,
  decision: ReviewDecisionInput
): Promise<boolean> {
  const result = await db.query<{ complete_review: boolean }>(
    `SELECT complete_review($1, $2, $3, $4, $5)`,
    [
      reviewId,
      userId,
      decision.decision,
      decision.notes || null,
      JSON.stringify(decision.modifications || {}),
    ]
  )

  const success = result.rows[0]?.complete_review === true

  if (success) {
    // Appliquer les actions post-décision
    await applyReviewDecision(reviewId, decision)
  }

  return success
}

/**
 * Ignore/saute un item de revue
 */
export async function skipReview(
  reviewId: string,
  userId: string,
  reason?: string
): Promise<void> {
  await db.query(
    `UPDATE human_review_queue
     SET status = 'skipped',
         decision = 'defer',
         decision_notes = $1,
         completed_by = $2,
         completed_at = NOW(),
         updated_at = NOW()
     WHERE id = $3`,
    [reason || 'Passé par l\'utilisateur', userId, reviewId]
  )
}

/**
 * Réassigne un item de revue
 */
export async function reassignReview(
  reviewId: string,
  newAssigneeId: string | null
): Promise<void> {
  await db.query(
    `UPDATE human_review_queue
     SET assigned_to = $1,
         assigned_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END,
         status = CASE WHEN $1 IS NOT NULL THEN 'assigned' ELSE 'pending' END,
         updated_at = NOW()
     WHERE id = $2`,
    [newAssigneeId, reviewId]
  )
}

/**
 * Statistiques de la queue de revue
 */
export async function getReviewStats(): Promise<ReviewQueueStats> {
  const result = await db.query(`SELECT * FROM get_review_queue_stats()`)

  if (result.rows.length === 0) {
    return {
      pendingCount: 0,
      assignedCount: 0,
      completedToday: 0,
      avgDecisionTimeMs: 0,
      byType: {} as Record<ReviewType, number>,
      byPriority: {} as Record<ReviewPriority, number>,
      byDecision: {} as Record<ReviewDecision, number>,
    }
  }

  const row = result.rows[0]
  return {
    pendingCount: parseInt(row.pending_count, 10),
    assignedCount: parseInt(row.assigned_count, 10),
    completedToday: parseInt(row.completed_today, 10),
    avgDecisionTimeMs: parseInt(row.avg_decision_time_ms, 10),
    byType: row.by_type || {},
    byPriority: row.by_priority || {},
    byDecision: row.by_decision || {},
  }
}

/**
 * Compte les items en attente pour un utilisateur
 */
export async function getPendingCountForUser(userId: string): Promise<{
  assigned: number
  available: number
}> {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE assigned_to = $1) as assigned,
      COUNT(*) FILTER (WHERE assigned_to IS NULL AND status = 'pending') as available
    FROM human_review_queue
    WHERE status IN ('pending', 'assigned')
      AND (expires_at IS NULL OR expires_at > NOW())
  `, [userId])

  const row = result.rows[0]
  return {
    assigned: parseInt(row.assigned, 10),
    available: parseInt(row.available, 10),
  }
}

/**
 * Récupère l'historique des revues complétées
 */
export async function getReviewHistory(options: {
  userId?: string
  limit?: number
  offset?: number
}): Promise<HumanReviewItem[]> {
  const { userId, limit = 50, offset = 0 } = options

  let query = `
    SELECT * FROM human_review_queue
    WHERE status IN ('completed', 'skipped')
  `
  const params: (string | number)[] = []
  let paramIndex = 1

  if (userId) {
    query += ` AND completed_by = $${paramIndex++}`
    params.push(userId)
  }

  query += ` ORDER BY completed_at DESC`
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
  params.push(limit, offset)

  const result = await db.query(query, params)
  return result.rows.map(mapRowToReviewItem)
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

/**
 * Crée une notification admin pour une revue urgente
 */
async function createAdminNotification(
  reviewId: string,
  request: CreateReviewRequest
): Promise<void> {
  try {
    // Vérifier si la table admin_notifications existe
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'admin_notifications'
      )
    `)

    if (!tableCheck.rows[0].exists) {
      console.warn('[HumanReview] Table admin_notifications non trouvée')
      return
    }

    await db.query(
      `INSERT INTO admin_notifications (
        notification_type,
        title,
        message,
        data,
        priority
      ) VALUES ($1, $2, $3, $4, $5)`,
      [
        'content_review_required',
        `Revue ${request.priority}: ${request.title}`,
        request.description || 'Une revue de contenu nécessite votre attention',
        JSON.stringify({
          reviewId,
          reviewType: request.reviewType,
          targetType: request.targetType,
          targetId: request.targetId,
          qualityScore: request.qualityScore,
          confidenceScore: request.confidenceScore,
        }),
        request.priority === 'urgent' ? 'high' : 'normal',
      ]
    )
  } catch (error) {
    console.error('[HumanReview] Erreur création notification:', error)
    // Ne pas faire échouer la création de la revue
  }
}

/**
 * Applique les actions suite à une décision de revue
 */
async function applyReviewDecision(
  reviewId: string,
  decision: ReviewDecisionInput
): Promise<void> {
  // Récupérer les détails de la revue
  const reviewResult = await db.query(
    `SELECT target_type, target_id, review_type
     FROM human_review_queue WHERE id = $1`,
    [reviewId]
  )

  if (reviewResult.rows.length === 0) return

  const review = reviewResult.rows[0]

  switch (decision.decision) {
    case 'approve':
      await handleApproval(review.target_type, review.target_id)
      break

    case 'reject':
      await handleRejection(review.target_type, review.target_id)
      break

    case 'modify':
      await handleModification(
        review.target_type,
        review.target_id,
        decision.modifications || {}
      )
      break

    case 'escalate':
      // Créer une nouvelle revue avec priorité plus haute
      await escalateReview(reviewId)
      break

    case 'defer':
      // Rien à faire, l'item est déjà marqué comme différé
      break
  }
}

/**
 * Gère l'approbation d'un item
 */
async function handleApproval(
  targetType: string,
  targetId: string
): Promise<void> {
  if (targetType === 'web_page') {
    // Marquer la page comme validée et prête pour indexation
    await db.query(
      `UPDATE web_pages
       SET processing_status = 'validated',
           requires_human_review = false,
           updated_at = NOW()
       WHERE id = $1`,
      [targetId]
    )
  } else if (targetType === 'classification') {
    // La classification est validée via validateClassification
    await db.query(
      `UPDATE legal_classifications
       SET requires_validation = false
       WHERE id = $1`,
      [targetId]
    )
  } else if (targetType === 'contradiction') {
    // Marquer la contradiction comme résolue
    await db.query(
      `UPDATE content_contradictions
       SET status = 'resolved'
       WHERE id = $1`,
      [targetId]
    )
  }
}

/**
 * Gère le rejet d'un item
 */
async function handleRejection(
  targetType: string,
  targetId: string
): Promise<void> {
  if (targetType === 'web_page') {
    await db.query(
      `UPDATE web_pages
       SET processing_status = 'rejected',
           requires_human_review = false,
           updated_at = NOW()
       WHERE id = $1`,
      [targetId]
    )
  } else if (targetType === 'contradiction') {
    await db.query(
      `UPDATE content_contradictions
       SET status = 'dismissed'
       WHERE id = $1`,
      [targetId]
    )
  }
}

/**
 * Gère la modification d'un item
 */
async function handleModification(
  targetType: string,
  targetId: string,
  modifications: Record<string, unknown>
): Promise<void> {
  if (targetType === 'classification' && modifications.classification) {
    // Mettre à jour la classification finale
    await db.query(
      `UPDATE legal_classifications
       SET final_classification = $1,
           requires_validation = false,
           validated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(modifications.classification), targetId]
    )
  }

  // Autres types de modifications selon le target_type
}

/**
 * Escalade une revue vers une priorité supérieure
 */
async function escalateReview(reviewId: string): Promise<void> {
  await db.query(
    `UPDATE human_review_queue
     SET priority = CASE
           WHEN priority = 'low' THEN 'normal'
           WHEN priority = 'normal' THEN 'high'
           WHEN priority = 'high' THEN 'urgent'
           ELSE priority
         END,
         status = 'pending',
         assigned_to = NULL,
         assigned_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [reviewId]
  )
}

/**
 * Mapper une row DB vers HumanReviewItem
 */
function mapRowToReviewItem(row: Record<string, unknown>): HumanReviewItem {
  return {
    id: row.id as string,
    reviewType: row.review_type as ReviewType,
    targetType: row.target_type as ReviewTargetType,
    targetId: row.target_id as string,
    title: row.title as string,
    description: row.description as string | null,
    context: row.context as Record<string, unknown>,
    suggestedActions: row.suggested_actions as SuggestedAction[],
    qualityScore: row.quality_score as number | null,
    confidenceScore: row.confidence_score as number | null,
    priority: row.priority as ReviewPriority,
    status: row.status as ReviewStatus,
    assignedTo: row.assigned_to as string | null,
    assignedAt: row.assigned_at ? new Date(row.assigned_at as string) : null,
    decision: row.decision as ReviewDecision | null,
    decisionNotes: row.decision_notes as string | null,
    modificationsMade: row.modifications_made as Record<string, unknown>,
    completedBy: row.completed_by as string | null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    timeToDecisionMs: row.time_to_decision_ms as number | null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}
