/**
 * API Route - Feedbacks Récents (Phase 5.1)
 *
 * GET /api/admin/feedback/recent?limit=50&days=7
 *
 * Retourne liste des feedbacks récents avec filtres optionnels.
 *
 * @module app/api/admin/feedback/recent/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { db } from '@/lib/db/postgres'

// =============================================================================
// GET - Récupérer feedbacks récents
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authentification admin
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier rôle admin/super-admin
    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )
    const userRole = userResult.rows[0]?.role
    if (userRole !== 'admin' && userRole !== 'super-admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Paramètres query
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)
    const daysBack = parseInt(searchParams.get('days') || '7', 10)
    const minRating = searchParams.get('min_rating')
      ? parseInt(searchParams.get('min_rating')!, 10)
      : null
    const maxRating = searchParams.get('max_rating')
      ? parseInt(searchParams.get('max_rating')!, 10)
      : null
    const domain = searchParams.get('domain')
    const unresolvedOnly = searchParams.get('unresolved') === 'true'

    // Validation paramètres
    if (daysBack < 1 || daysBack > 365) {
      return NextResponse.json(
        { error: 'Paramètre days doit être entre 1 et 365' },
        { status: 400 }
      )
    }

    if (
      minRating &&
      (minRating < 1 || minRating > 5 || (maxRating && minRating > maxRating))
    ) {
      return NextResponse.json(
        { error: 'Paramètres rating invalides' },
        { status: 400 }
      )
    }

    // Construire requête SQL dynamique
    let queryText = `
      SELECT
        id,
        conversation_id,
        message_id,
        question,
        rating,
        feedback_type,
        missing_info,
        incorrect_citation,
        hallucination_details,
        suggested_sources,
        comment,
        user_id,
        user_role,
        domain,
        rag_confidence,
        sources_count,
        response_time_ms,
        is_resolved,
        resolved_by,
        resolved_at,
        created_at
      FROM rag_feedback
      WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
    `

    const queryParams: (string | number | boolean)[] = [daysBack]
    let paramIndex = 2

    if (minRating !== null) {
      queryText += ` AND rating >= $${paramIndex}`
      queryParams.push(minRating)
      paramIndex++
    }

    if (maxRating !== null) {
      queryText += ` AND rating <= $${paramIndex}`
      queryParams.push(maxRating)
      paramIndex++
    }

    if (domain) {
      queryText += ` AND domain = $${paramIndex}`
      queryParams.push(domain)
      paramIndex++
    }

    if (unresolvedOnly) {
      queryText += ` AND is_resolved = false`
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex}`
    queryParams.push(limit)

    // Exécuter requête
    const result = await db.query(queryText, queryParams)

    // Formater résultats
    const feedbacks = result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      question: row.question,
      rating: row.rating,
      feedbackType: row.feedback_type || [],
      missingInfo: row.missing_info,
      incorrectCitation: row.incorrect_citation,
      hallucinationDetails: row.hallucination_details,
      suggestedSources: row.suggested_sources || [],
      comment: row.comment,
      userId: row.user_id,
      userRole: row.user_role,
      domain: row.domain,
      ragConfidence: row.rag_confidence,
      sourcesCount: row.sources_count,
      responseTimeMs: row.response_time_ms,
      isResolved: row.is_resolved,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at,
      createdAt: row.created_at,
    }))

    console.log(
      `[Feedback Recent] Retourné ${feedbacks.length} feedbacks (limit=${limit}, days=${daysBack}, unresolved=${unresolvedOnly})`
    )

    return NextResponse.json({
      success: true,
      feedbacks,
      count: feedbacks.length,
      filters: {
        limit,
        days: daysBack,
        minRating,
        maxRating,
        domain,
        unresolvedOnly,
      },
    })
  } catch (error) {
    console.error('[Feedback Recent] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
