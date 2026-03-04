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
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { z } from 'zod'

const FeedbackSchema = z.object({
  conversationId: z.string().uuid().optional().nullable(),
  messageId: z.string().uuid().optional().nullable(),
  question: z.string().min(1, 'Question requise').max(4000),
  answer: z.string().max(10000).optional().nullable(),
  sourcesUsed: z.array(z.unknown()).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  feedbackType: z.array(z.string().max(100)).max(10).optional(),
  missingInfo: z.string().max(2000).optional().nullable(),
  incorrectCitation: z.string().max(2000).optional().nullable(),
  incompleteReason: z.string().max(2000).optional().nullable(),
  hallucinationDetails: z.string().max(2000).optional().nullable(),
  suggestedSources: z.array(z.string().max(500)).max(20).optional().nullable(),
  comment: z.string().max(3000).optional().nullable(),
  domain: z.string().max(100).optional().nullable(),
  ragConfidence: z.number().min(0).max(1).optional().nullable(),
  sourcesCount: z.number().int().min(0).max(1000).optional().nullable(),
  responseTimeMs: z.number().int().min(0).optional().nullable(),
})

// =============================================================================
// POST - Enregistrer feedback
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Parser + valider body
    const rawBody = await request.json()
    const parseResult = FeedbackSchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message ?? 'Corps de requête invalide' },
        { status: 400 }
      )
    }

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
    } = parseResult.data

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
