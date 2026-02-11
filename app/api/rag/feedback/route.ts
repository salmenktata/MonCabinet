/**
 * API Route - Enregistrement Feedback RAG (Phase 5.1)
 *
 * POST /api/rag/feedback
 *
 * Enregistre feedback avocat tunisien sur réponse RAG pour
 * amélioration continue du système.
 *
 * @module app/api/rag/feedback/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { db } from '@/lib/db/postgres'

// =============================================================================
// POST - Enregistrer feedback
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authentification
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Parser body
    const body = await request.json()

    const {
      conversationId,
      messageId,
      question,
      answer,
      sourcesUsed,
      rating,
      feedbackType,
      missingInfo,
      incorrectCitation,
      incompleteReason,
      hallucinationDetails,
      suggestedSources,
      comment,
      domain,
      ragConfidence,
      sourcesCount,
      responseTimeMs,
    } = body

    // Validation
    if (!question || !rating || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Question et rating (1-5) requis' },
        { status: 400 }
      )
    }

    // Récupérer rôle utilisateur
    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )

    const userRole = userResult.rows[0]?.role || 'user'

    // Insérer feedback
    const insertQuery = `
      INSERT INTO rag_feedback (
        conversation_id,
        message_id,
        question,
        answer,
        sources_used,
        rating,
        feedback_type,
        missing_info,
        incorrect_citation,
        incomplete_reason,
        hallucination_details,
        suggested_sources,
        comment,
        user_id,
        user_role,
        domain,
        rag_confidence,
        sources_count,
        response_time_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id, created_at
    `

    const result = await db.query(insertQuery, [
      conversationId || null,
      messageId || null,
      question,
      answer || null,
      sourcesUsed || null,
      rating,
      feedbackType || [],
      missingInfo || null,
      incorrectCitation || null,
      incompleteReason || null,
      hallucinationDetails || null,
      suggestedSources || null,
      comment || null,
      session.user.id,
      userRole,
      domain || null,
      ragConfidence || null,
      sourcesCount || null,
      responseTimeMs || null,
    ])

    const feedbackId = result.rows[0].id

    console.log(
      `[Feedback] Nouveau feedback enregistré: ${feedbackId} - Rating ${rating}/5 - User ${session.user.id}`
    )

    // Si hallucination signalée, logger en priorité
    if (feedbackType?.includes('hallucination')) {
      console.warn(
        `[Feedback] ⚠️ HALLUCINATION SIGNALÉE - Feedback ${feedbackId} - Question: ${question.substring(0, 100)}...`
      )
    }

    return NextResponse.json({
      success: true,
      feedbackId,
      message: 'Feedback enregistré avec succès',
    })
  } catch (error) {
    console.error('[Feedback] Erreur enregistrement:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
