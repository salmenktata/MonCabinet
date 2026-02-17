import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Liste paginée des exécutions de crons
 * GET /api/admin/cron-executions/list?page=1&limit=50&status=failed&cronName=
 * Auth: Session admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'

export async function GET(req: NextRequest) {
  try {
    // 1. Parse params
    const searchParams = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const status = searchParams.get('status') || undefined
    const cronName = searchParams.get('cronName') || undefined
    const offset = (page - 1) * limit

    // 2. Build query
    const conditions = []
    const params: any[] = []
    let paramIndex = 1

    if (status) {
      conditions.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    if (cronName) {
      conditions.push(`cron_name = $${paramIndex}`)
      params.push(cronName)
      paramIndex++
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM cron_executions ${whereClause}`,
      params
    )
    const count = parseInt(countResult.rows[0].count, 10)

    // Get executions
    const executionsResult = await db.query(
      `SELECT * FROM cron_executions
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )
    const executions = executionsResult.rows

    return NextResponse.json({
      success: true,
      executions: executions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      filters: {
        status,
        cronName,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron List] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
