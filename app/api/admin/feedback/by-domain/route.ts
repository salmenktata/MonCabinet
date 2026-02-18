/**
 * API Route - Statistiques feedback par domaine juridique
 *
 * GET /api/admin/feedback/by-domain?days=30
 *
 * Retourne le breakdown satisfaction par domaine.
 *
 * @module app/api/admin/feedback/by-domain/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const daysBack = parseInt(request.nextUrl.searchParams.get('days') || '30', 10)

    const result = await db.query(
      `SELECT
         domain,
         COUNT(*) AS total_feedbacks,
         ROUND(AVG(rating)::numeric, 2) AS avg_rating,
         COUNT(*) FILTER (WHERE rating >= 4) AS positive_count,
         COUNT(*) FILTER (WHERE rating <= 2) AS negative_count,
         ROUND(
           (COUNT(*) FILTER (WHERE rating >= 4))::numeric / NULLIF(COUNT(*), 0) * 100,
           1
         ) AS satisfaction_rate,
         COUNT(*) FILTER (WHERE 'hallucination' = ANY(feedback_type)) AS hallucination_count,
         COUNT(*) FILTER (WHERE 'missing_info' = ANY(feedback_type)) AS missing_info_count,
         ROUND(AVG(rag_confidence)::numeric, 3) AS avg_rag_confidence,
         ROUND(AVG(response_time_ms)::numeric, 0) AS avg_response_time_ms
       FROM rag_feedback
       WHERE domain IS NOT NULL
         AND created_at >= NOW() - ($1 || ' days')::INTERVAL
       GROUP BY domain
       ORDER BY total_feedbacks DESC`,
      [daysBack]
    )

    return NextResponse.json({
      success: true,
      domains: result.rows,
      period_days: daysBack,
    })
  } catch (error) {
    console.error('[Feedback By Domain] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
