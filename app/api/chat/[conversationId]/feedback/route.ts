/**
 * API Route: Feedback sur les messages chat
 *
 * POST /api/chat/[id]/feedback - Soumettre un feedback
 * GET /api/chat/[id]/feedback - Récupérer le feedback existant
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

interface FeedbackInput {
  rating: 'positive' | 'negative'
  reasons?: string[]
  comment?: string
}

// Raisons valides pour feedback négatif
const VALID_NEGATIVE_REASONS = [
  'incorrect',
  'incomplete',
  'irrelevant',
  'unclear',
  'outdated',
  'other',
]

// =============================================================================
// GET - Récupérer le feedback existant
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { conversationId } = await params

    // Récupérer le feedback de l'utilisateur pour ce message
    const result = await db.query(
      `SELECT * FROM get_message_feedback($1, $2)`,
      [conversationId, session.user.id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ feedback: null })
    }

    const row = result.rows[0]
    return NextResponse.json({
      feedback: {
        id: row.id,
        rating: row.rating,
        reasons: row.reasons || [],
        comment: row.comment,
        createdAt: row.created_at,
      },
    })
  } catch (error) {
    console.error('[Feedback GET] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST - Soumettre un feedback
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { conversationId } = await params
    const body = await request.json() as FeedbackInput

    // Validation
    if (!body.rating || !['positive', 'negative'].includes(body.rating)) {
      return NextResponse.json(
        { error: 'Rating invalide (positive ou negative)' },
        { status: 400 }
      )
    }

    // Valider les raisons si feedback négatif
    const reasons = body.reasons || []
    if (body.rating === 'negative' && reasons.length > 0) {
      const invalidReasons = reasons.filter((r) => !VALID_NEGATIVE_REASONS.includes(r))
      if (invalidReasons.length > 0) {
        return NextResponse.json(
          { error: `Raisons invalides: ${invalidReasons.join(', ')}` },
          { status: 400 }
        )
      }
    }

    // Vérifier que le message existe et appartient à une conversation de l'utilisateur
    const messageCheck = await db.query(
      `SELECT m.id FROM chat_messages m
       JOIN chat_conversations c ON m.conversation_id = c.id
       WHERE m.id = $1 AND c.user_id = $2`,
      [conversationId, session.user.id]
    )

    if (messageCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Message non trouvé' },
        { status: 404 }
      )
    }

    // Vérifier permission
    const permCheck = await db.query(
      `SELECT can_user_provide_feedback($1) as can_feedback`,
      [session.user.id]
    )

    if (!permCheck.rows[0]?.can_feedback) {
      return NextResponse.json(
        { error: 'Non autorisé à donner du feedback' },
        { status: 403 }
      )
    }

    // Upsert le feedback
    const result = await db.query(
      `SELECT upsert_message_feedback($1, $2, $3, $4, $5) as feedback_id`,
      [
        conversationId,
        session.user.id,
        body.rating,
        reasons,
        body.comment || null,
      ]
    )

    return NextResponse.json({
      success: true,
      feedbackId: result.rows[0].feedback_id,
    })
  } catch (error) {
    console.error('[Feedback POST] Erreur:', error)

    if (error instanceof Error && error.message.includes('non autorisé')) {
      return NextResponse.json(
        { error: 'Non autorisé à donner du feedback' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE - Supprimer un feedback
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { conversationId } = await params

    const result = await db.query(
      `DELETE FROM chat_message_feedback
       WHERE message_id = $1 AND user_id = $2`,
      [conversationId, session.user.id]
    )

    return NextResponse.json({
      success: true,
      deleted: (result.rowCount || 0) > 0,
    })
  } catch (error) {
    console.error('[Feedback DELETE] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
