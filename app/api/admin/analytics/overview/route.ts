/**
 * GET /api/admin/analytics/overview
 * KPIs globaux : utilisateurs, RAG, feedback, coûts IA du mois
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

    const [usersResult, ragResult, feedbackResult, costsResult] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'approved' AND last_login_at >= NOW() - INTERVAL '7 days')::int AS active_7d,
          COUNT(*) FILTER (WHERE status = 'approved' AND last_login_at >= NOW() - INTERVAL '30 days')::int AS active_30d,
          COUNT(*) FILTER (WHERE status = 'approved' AND last_login_at IS NULL)::int AS never_connected,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'approved' AND last_login_at IS NOT NULL)::int AS activated
        FROM users
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::int AS today,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS week,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS month,
          COUNT(*) FILTER (WHERE abstention_reason IS NOT NULL AND created_at >= NOW() - INTERVAL '30 days')::int AS abstentions_30d,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS total_30d
        FROM rag_query_log
        WHERE created_at >= NOW() - INTERVAL '90 days'
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE rating = 'positive')::int AS positive,
          COUNT(*) FILTER (WHERE rating = 'negative')::int AS negative,
          COUNT(*)::int AS total
        FROM chat_message_feedback
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
      query(`
        SELECT
          COALESCE(SUM(estimated_cost_usd), 0)::float AS total_cost_usd,
          COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS total_tokens
        FROM ai_usage_logs
        WHERE created_at >= DATE_TRUNC('month', NOW())
      `),
    ])

    const u = usersResult.rows[0]
    const r = ragResult.rows[0]
    const f = feedbackResult.rows[0]
    const c = costsResult.rows[0]

    const activationRate = u.approved > 0 ? Math.round((u.activated / u.approved) * 100) : 0
    const abstentionRate = r.total_30d > 0 ? Math.round((r.abstentions_30d / r.total_30d) * 100) : 0
    const satisfactionRate = f.total > 0 ? Math.round((f.positive / f.total) * 100) : 0

    return NextResponse.json({
      success: true,
      users: {
        total: u.total,
        active_7d: u.active_7d,
        active_30d: u.active_30d,
        never_connected: u.never_connected,
        pending: u.pending,
        activation_rate: activationRate,
      },
      rag: {
        today: r.today,
        week: r.week,
        month: r.month,
        abstention_rate_30d: abstentionRate,
      },
      feedback: {
        positive: f.positive,
        negative: f.negative,
        total: f.total,
        satisfaction_rate: satisfactionRate,
      },
      costs: {
        total_cost_usd: parseFloat(c.total_cost_usd),
        total_tokens: parseInt(c.total_tokens),
      },
    })
  } catch (error) {
    console.error('[Analytics Overview] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
