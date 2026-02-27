/**
 * API Route - Expert Review Queue
 *
 * GET  /api/admin/review-queue             → Liste les items en attente (triés par risque)
 * PATCH /api/admin/review-queue?id=xxx     → Valider/rejeter/escalader un item
 *   Body: { status: 'reviewed'|'dismissed'|'escalated', validatedAnswer?, reviewNotes?, reviewedBy? }
 *
 * Les items validés sont automatiquement convertis en Silver cases.
 *
 * @module app/api/admin/review-queue/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { getReviewQueueStats } from '@/lib/ai/risk-scoring-service'

// =============================================================================
// GET — Liste + stats
// =============================================================================

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || 'pending'
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = parseInt(searchParams.get('offset') || '0')
  const statsOnly = searchParams.get('stats') === 'true'

  if (statsOnly) {
    const stats = await getReviewQueueStats()
    return NextResponse.json(stats)
  }

  const [items, stats] = await Promise.all([
    db.query(
      `SELECT
         id, conversation_id, question, answer, sources_used,
         risk_score, risk_level, risk_signals,
         avg_similarity, sources_count, quality_indicator, abstention_reason,
         status, reviewer_id, reviewed_at, review_notes, silver_case_id,
         created_at
       FROM expert_review_queue
       WHERE status = $1
       ORDER BY risk_score DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    ),
    getReviewQueueStats(),
  ])

  return NextResponse.json({
    items: items.rows,
    stats,
    total: items.rowCount,
  })
})

// =============================================================================
// PATCH — Validation/Rejet
// =============================================================================

export const PATCH = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { status, validatedAnswer, reviewNotes, reviewedBy } = body

  if (!status || !['reviewed', 'dismissed', 'escalated'].includes(status)) {
    return NextResponse.json(
      { error: 'status doit être "reviewed", "dismissed" ou "escalated"' },
      { status: 400 }
    )
  }

  // Récupérer l'item pour créer le Silver case si validé
  const itemResult = await db.query(
    `SELECT * FROM expert_review_queue WHERE id = $1`,
    [id]
  )
  if (itemResult.rows.length === 0) {
    return NextResponse.json({ error: 'Item introuvable' }, { status: 404 })
  }
  const item = itemResult.rows[0]

  let silverCaseId: string | null = null

  // Si révisé avec une réponse validée → créer un Silver case
  if (status === 'reviewed' && validatedAnswer) {
    const silverResult = await db.query(
      `INSERT INTO rag_silver_dataset (
        question, actual_answer, key_points, gold_chunk_ids,
        avg_similarity, status, reviewed_by, reviewed_at, review_notes
      ) VALUES ($1, $2, $3, $4, $5, 'validated', $6, NOW(), $7)
      RETURNING id`,
      [
        item.question,
        validatedAnswer,
        [],  // key_points seront extraits ultérieurement
        [],  // gold_chunk_ids non disponibles ici
        item.avg_similarity,
        reviewedBy || null,
        reviewNotes || 'Validé depuis review queue',
      ]
    )
    silverCaseId = silverResult.rows[0]?.id || null
  }

  // Mettre à jour l'item
  await db.query(
    `UPDATE expert_review_queue
     SET status = $1, validated_answer = $2, review_notes = $3,
         reviewer_id = $4, reviewed_at = NOW(),
         silver_case_id = $5, updated_at = NOW()
     WHERE id = $6`,
    [
      status,
      validatedAnswer || null,
      reviewNotes || null,
      reviewedBy || null,
      silverCaseId,
      id,
    ]
  )

  return NextResponse.json({
    success: true,
    id,
    status,
    silverCaseId,
  })
})
