/**
 * Service Révision Contenu Juridique
 */

import { db } from '@/lib/db/postgres'

export interface ContentReview {
  id: string
  kbId: string
  reviewerId: string
  status: 'pending' | 'approved' | 'rejected' | 'needs_changes'
  comments?: string
  suggestedChanges?: string
  qualityRating?: number
  reviewedAt?: Date
  createdAt: Date
}

export interface ReviewQueueItem {
  kbId: string
  title: string
  category: string
  qualityScore: number
  reviewStatus: string
  verified: boolean
  totalReviews: number
}

export async function submitForReview(kbId: string, submittedBy: string): Promise<string | null> {
  try {
    const result = await db.query<{ submit_for_review: string }>(
      'SELECT submit_for_review($1, $2) as review_id',
      [kbId, submittedBy]
    )
    return result.rows[0]?.submit_for_review || null
  } catch (error) {
    console.error('[Review] Erreur:', error)
    return null
  }
}

export async function approveReview(reviewId: string, reviewerId: string, comments?: string): Promise<boolean> {
  try {
    const result = await db.query<{ approve_review: boolean }>(
      'SELECT approve_review($1, $2, $3, NULL) as success',
      [reviewId, reviewerId, comments || null]
    )
    return result.rows[0]?.approve_review || false
  } catch (error) {
    console.error('[Review] Erreur:', error)
    return false
  }
}

export async function getReviewQueue(limit: number = 50): Promise<ReviewQueueItem[]> {
  try {
    const result = await db.query<ReviewQueueItem>(
      `SELECT
        kb_id as "kbId",
        title,
        category,
        quality_score as "qualityScore",
        review_status as "reviewStatus",
        verified,
        total_reviews as "totalReviews"
      FROM vw_content_review_queue
      LIMIT $1`,
      [limit]
    )
    return result.rows
  } catch (error) {
    console.error('[Review] Erreur:', error)
    return []
  }
}
