/**
 * GET /api/admin/analytics/connections
 * Logs de connexion : timeline 100 dernières + graphique 30j
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

    // Timeline dernières connexions
    let timeline: unknown[] = []
    let dailyChart: unknown[] = []
    let summary = { total: 0, failures: 0, unique_ips: 0, failure_rate: 0 }

    try {
      const [timelineResult, dailyResult, summaryResult] = await Promise.all([
        query(`
          SELECT
            ual.user_id,
            ual.user_email,
            ual.action,
            ual.ip_address,
            ual.user_agent,
            ual.created_at,
            COALESCE(u.nom, '') AS nom,
            COALESCE(u.prenom, '') AS prenom
          FROM user_activity_logs ual
          LEFT JOIN users u ON u.id = ual.user_id
          WHERE ual.action IN ('login', 'login_failed')
          ORDER BY ual.created_at DESC
          LIMIT 100
        `),
        query(`
          SELECT
            DATE(created_at)::text AS date,
            COUNT(*) FILTER (WHERE action = 'login')::int AS success,
            COUNT(*) FILTER (WHERE action = 'login_failed')::int AS failures
          FROM user_activity_logs
          WHERE action IN ('login', 'login_failed')
            AND created_at >= NOW() - INTERVAL '30 days'
          GROUP BY 1
          ORDER BY 1
        `),
        query(`
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE action = 'login_failed')::int AS failures,
            COUNT(DISTINCT ip_address)::int AS unique_ips
          FROM user_activity_logs
          WHERE action IN ('login', 'login_failed')
            AND created_at >= NOW() - INTERVAL '30 days'
        `),
      ])
      timeline = timelineResult.rows
      dailyChart = dailyResult.rows
      const s = summaryResult.rows[0]
      summary = {
        total: s.total,
        failures: s.failures,
        unique_ips: s.unique_ips,
        failure_rate: s.total > 0 ? Math.round((s.failures / s.total) * 100) : 0,
      }
    } catch {
      // user_activity_logs peut ne pas exister
    }

    return NextResponse.json({
      success: true,
      timeline,
      daily_chart: dailyChart,
      summary,
    })
  } catch (error) {
    console.error('[Analytics Connections] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
