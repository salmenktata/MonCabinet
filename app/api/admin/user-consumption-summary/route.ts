import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'

export async function GET(request: NextRequest) {
  try {
    // 1. Auth check (super-admin only)
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // 2. Parse query params
    const searchParams = request.nextUrl.searchParams
    const days = parseInt(searchParams.get('days') || '7')
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // 3. SQL query for user consumption
    const query = `
      SELECT
        u.id,
        u.email,
        u.nom,
        u.prenom,
        u.plan,
        COUNT(*) as total_operations,
        SUM(a.input_tokens + a.output_tokens) as total_tokens,
        SUM(a.estimated_cost_usd) as total_cost,
        jsonb_object_agg(
          COALESCE(a.provider, 'unknown'),
          jsonb_build_object(
            'operations', COUNT(*) FILTER (WHERE a.provider IS NOT NULL),
            'cost', COALESCE(SUM(a.estimated_cost_usd) FILTER (WHERE a.provider IS NOT NULL), 0)
          )
        ) as provider_breakdown
      FROM users u
      INNER JOIN ai_usage_logs a ON a.user_id = u.id
      WHERE a.created_at >= $1
        AND (u.is_system_account = false OR u.is_system_account IS NULL)
      GROUP BY u.id, u.email, u.nom, u.prenom, u.plan
      HAVING COUNT(*) > 0
      ORDER BY total_cost DESC
      LIMIT 50
    `

    const result = await db.query(query, [startDate.toISOString()])

    // 4. Transform to response format
    const users = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      nom: row.nom,
      prenom: row.prenom,
      plan: row.plan || 'free',
      totalOperations: parseInt(row.total_operations, 10) || 0,
      totalTokens: parseInt(row.total_tokens, 10) || 0,
      totalCost: parseFloat(row.total_cost) || 0,
      providerBreakdown: row.provider_breakdown || {}
    }))

    // 5. Return response
    return NextResponse.json({
      users,
      period: {
        start: startDate.toISOString(),
        end: new Date().toISOString(),
        days
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    })
  } catch (error) {
    console.error('[User Consumption Summary API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
