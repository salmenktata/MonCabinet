/**
 * GET /api/admin/analytics/feedback
 * Satisfaction : ratings, types problèmes, tendance 30j, users négatifs répétés
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const [ratingsResult, typesResult, trendResult, negativeUsersResult, ragResolutionResult] =
      await Promise.all([
        // Distribution ratings 1-5 (rag_feedback)
        query(`
          SELECT
            rating::text AS rating,
            COUNT(*)::int AS count
          FROM rag_feedback
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1
        `).catch(() => ({ rows: [] })),

        // Top types de problèmes (unnest array)
        query(`
          SELECT
            unnest(feedback_type) AS type,
            COUNT(*)::int AS count
          FROM rag_feedback
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY count DESC
          LIMIT 10
        `).catch(() => ({ rows: [] })),

        // Tendance 30j positive/négative (chat_message_feedback)
        query(`
          SELECT
            DATE(created_at)::text AS date,
            COUNT(*) FILTER (WHERE rating = 'positive')::int AS positive,
            COUNT(*) FILTER (WHERE rating = 'negative')::int AS negative
          FROM chat_message_feedback
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1
        `),

        // Users avec feedbacks négatifs répétés (> 3 en 7j)
        query(`
          SELECT
            u.id, u.email,
            COALESCE(u.nom, '') AS nom,
            COALESCE(u.prenom, '') AS prenom,
            COUNT(*)::int AS neg_count
          FROM chat_message_feedback cmf
          JOIN users u ON u.id = cmf.user_id
          WHERE cmf.rating = 'negative'
            AND cmf.created_at >= NOW() - INTERVAL '7 days'
          GROUP BY u.id, u.email, u.nom, u.prenom
          HAVING COUNT(*) > 3
          ORDER BY neg_count DESC
        `),

        // Résolution rag_feedback
        query(`
          SELECT
            COUNT(*) FILTER (WHERE is_resolved = true)::int AS resolved,
            COUNT(*) FILTER (WHERE is_resolved = false OR is_resolved IS NULL)::int AS unresolved,
            COUNT(*)::int AS total
          FROM rag_feedback
        `).catch(() => ({ rows: [{ resolved: 0, unresolved: 0, total: 0 }] })),
      ])

    const resolution = ragResolutionResult.rows[0] || { resolved: 0, unresolved: 0, total: 0 }

    // Totaux satisfaction globale
    const trendTotal = trendResult.rows.reduce(
      (acc, row) => ({ positive: acc.positive + row.positive, negative: acc.negative + row.negative }),
      { positive: 0, negative: 0 }
    )
    const satisfactionRate =
      trendTotal.positive + trendTotal.negative > 0
        ? Math.round((trendTotal.positive / (trendTotal.positive + trendTotal.negative)) * 100)
        : 0

    return NextResponse.json({
      success: true,
      ratings: ratingsResult.rows,
      problem_types: typesResult.rows,
      trend: trendResult.rows,
      negative_users: negativeUsersResult.rows,
      resolution: {
        resolved: resolution.resolved,
        unresolved: resolution.unresolved,
        total: resolution.total,
      },
      summary: {
        satisfaction_rate_30d: satisfactionRate,
        total_positive: trendTotal.positive,
        total_negative: trendTotal.negative,
      },
    })
  } catch (error) {
    console.error('[Analytics Feedback] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
