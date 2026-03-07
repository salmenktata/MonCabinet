/**
 * GET /api/admin/analytics/tokens
 * Consommation tokens & coûts IA : tendance 30j par provider, top users, par opération
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

    const [dailyResult, topUsersResult, byOperationResult, totalsResult] = await Promise.all([
      // Tokens par provider/jour sur 30j
      query(`
        SELECT
          DATE(created_at)::text AS date,
          provider,
          SUM(input_tokens + output_tokens)::bigint AS total_tokens,
          SUM(estimated_cost_usd)::float AS cost_usd
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1, 2
        ORDER BY 1, 2
      `),
      // Top 10 users par coût ce mois
      query(`
        SELECT
          u.id, u.email,
          COALESCE(u.nom, '') AS nom,
          COALESCE(u.prenom, '') AS prenom,
          SUM(al.estimated_cost_usd)::float AS total_cost,
          SUM(al.input_tokens + al.output_tokens)::bigint AS total_tokens,
          COUNT(*)::int AS operations
        FROM ai_usage_logs al
        JOIN users u ON u.id = al.user_id
        WHERE al.created_at >= DATE_TRUNC('month', NOW())
        GROUP BY u.id, u.email, u.nom, u.prenom
        ORDER BY total_cost DESC
        LIMIT 10
      `),
      // Par type d'opération
      query(`
        SELECT
          operation_type,
          SUM(input_tokens + output_tokens)::bigint AS total_tokens,
          SUM(estimated_cost_usd)::float AS cost_usd,
          COUNT(*)::int AS count
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY total_tokens DESC
      `),
      // Totaux globaux
      query(`
        SELECT
          COALESCE(SUM(input_tokens), 0)::bigint AS input_tokens,
          COALESCE(SUM(output_tokens), 0)::bigint AS output_tokens,
          COALESCE(SUM(estimated_cost_usd), 0)::float AS total_cost_usd,
          COUNT(*)::int AS operations,
          COUNT(DISTINCT DATE(created_at))::int AS active_days
        FROM ai_usage_logs
        WHERE created_at >= NOW() - INTERVAL '30 days'
      `),
    ])

    const t = totalsResult.rows[0]
    const totalTokens = parseInt(t.input_tokens) + parseInt(t.output_tokens)
    const avgCostPerOp = t.operations > 0 ? parseFloat(t.total_cost_usd) / t.operations : 0

    return NextResponse.json({
      success: true,
      daily: dailyResult.rows,
      top_users: topUsersResult.rows,
      by_operation: byOperationResult.rows,
      totals: {
        input_tokens: parseInt(t.input_tokens),
        output_tokens: parseInt(t.output_tokens),
        total_tokens: totalTokens,
        total_cost_usd: parseFloat(t.total_cost_usd),
        operations: t.operations,
        avg_cost_per_op: avgCostPerOp,
      },
    })
  } catch (error) {
    console.error('[Analytics Tokens] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
