/**
 * GET /api/admin/analytics/users
 * Tableau des utilisateurs avec métriques agrégées
 * Params : ?page=1&status=&plan=&filter=never_connected|inactive
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = request.nextUrl
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const offset = (page - 1) * PAGE_SIZE
    const statusFilter = searchParams.get('status') || ''
    const planFilter = searchParams.get('plan') || ''
    const filter = searchParams.get('filter') || ''

    const conditions: string[] = []
    const params: string[] = []

    if (statusFilter) {
      params.push(statusFilter)
      conditions.push(`u.status = $${params.length}`)
    }
    if (planFilter) {
      params.push(planFilter)
      conditions.push(`u.plan = $${params.length}`)
    }
    if (filter === 'never_connected') {
      conditions.push(`u.last_login_at IS NULL`)
    } else if (filter === 'inactive') {
      conditions.push(`(u.last_login_at IS NULL OR u.last_login_at < NOW() - INTERVAL '30 days')`)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const [usersResult, countResult] = await Promise.all([
      query(
        `
        SELECT
          u.id, u.email,
          COALESCE(u.nom, '') AS nom,
          COALESCE(u.prenom, '') AS prenom,
          u.plan, u.status, u.last_login_at,
          COALESCE(u.login_count, 0) AS login_count,
          u.created_at,
          (SELECT COUNT(*)::int FROM dossiers d WHERE d.user_id = u.id) AS dossiers_count,
          (SELECT COUNT(*)::int FROM clients c WHERE c.user_id = u.id) AS clients_count,
          COALESCE((
            SELECT SUM(al.input_tokens + al.output_tokens)::bigint
            FROM ai_usage_logs al
            WHERE al.user_id = u.id
              AND al.created_at >= DATE_TRUNC('month', NOW())
          ), 0) AS tokens_month,
          COALESCE((
            SELECT SUM(al.estimated_cost_usd)::float
            FROM ai_usage_logs al
            WHERE al.user_id = u.id
              AND al.created_at >= DATE_TRUNC('month', NOW())
          ), 0) AS cost_month_usd,
          COALESCE((
            SELECT COUNT(*)::int
            FROM rag_query_log rql
            JOIN chat_conversations cc ON cc.id = rql.conversation_id
            WHERE cc.user_id = u.id
              AND rql.created_at >= NOW() - INTERVAL '7 days'
          ), 0) AS rag_7d,
          COALESCE((
            SELECT ROUND(AVG(CASE WHEN cmf.rating = 'positive' THEN 100.0 ELSE 0.0 END))::int
            FROM chat_message_feedback cmf
            WHERE cmf.user_id = u.id
          ), -1) AS satisfaction_pct
        FROM users u
        ${whereClause}
        ORDER BY u.last_login_at DESC NULLS LAST
        LIMIT ${PAGE_SIZE} OFFSET ${offset}
        `,
        params
      ),
      query(
        `SELECT COUNT(*)::int AS total FROM users u ${whereClause}`,
        params
      ),
    ])

    return NextResponse.json({
      success: true,
      users: usersResult.rows,
      total: countResult.rows[0].total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.ceil(countResult.rows[0].total / PAGE_SIZE),
    })
  } catch (error) {
    console.error('[Analytics Users] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
