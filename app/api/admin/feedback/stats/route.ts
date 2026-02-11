/**
 * API Route - Statistiques Feedback RAG (Phase 5.1)
 *
 * GET /api/admin/feedback/stats?days=7
 *
 * Retourne statistiques globales feedback pour période donnée.
 *
 * @module app/api/admin/feedback/stats/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { db } from '@/lib/db/postgres'

// =============================================================================
// GET - Récupérer statistiques feedback
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

    // Paramètre période (défaut 7 jours)
    const searchParams = request.nextUrl.searchParams
    const daysBack = parseInt(searchParams.get('days') || '7', 10)

    if (daysBack < 1 || daysBack > 365) {
      return NextResponse.json(
        { error: 'Paramètre days doit être entre 1 et 365' },
        { status: 400 }
      )
    }

    // Appel fonction SQL get_feedback_stats()
    const statsResult = await db.query(
      `SELECT * FROM get_feedback_stats($1)`,
      [daysBack]
    )

    if (!statsResult.rows || statsResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        stats: {
          total_feedbacks: 0,
          avg_rating: null,
          satisfaction_rate: null,
          hallucination_rate: null,
          avg_response_time: null,
          most_common_issue: null,
        },
        period_days: daysBack,
      })
    }

    const stats = statsResult.rows[0]

    console.log(
      `[Feedback Stats] Période ${daysBack}j - Total: ${stats.total_feedbacks}, Avg Rating: ${stats.avg_rating}, Satisfaction: ${stats.satisfaction_rate}%`
    )

    return NextResponse.json({
      success: true,
      stats: {
        total_feedbacks: parseInt(stats.total_feedbacks, 10),
        avg_rating: stats.avg_rating ? parseFloat(stats.avg_rating) : null,
        satisfaction_rate: stats.satisfaction_rate
          ? parseFloat(stats.satisfaction_rate)
          : null,
        hallucination_rate: stats.hallucination_rate
          ? parseFloat(stats.hallucination_rate)
          : null,
        avg_response_time: stats.avg_response_time
          ? parseFloat(stats.avg_response_time)
          : null,
        most_common_issue: stats.most_common_issue,
      },
      period_days: daysBack,
    })
  } catch (error) {
    console.error('[Feedback Stats] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
