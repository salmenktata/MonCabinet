/**
 * API: Liste paginée des exécutions de crons
 * GET /api/admin/cron-executions/list?page=1&limit=50&status=failed&cronName=
 * Auth: Session admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'

export async function GET(req: NextRequest) {
  try {
    // 1. Vérification auth admin
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Parse params
    const searchParams = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)))
    const status = searchParams.get('status') || undefined
    const cronName = searchParams.get('cronName') || undefined
    const offset = (page - 1) * limit

    // 3. Build query
    const supabase = await createClient()
    let query = supabase
      .from('cron_executions')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) {
      query = query.eq('status', status)
    }

    if (cronName) {
      query = query.eq('cron_name', cronName)
    }

    const { data: executions, error, count } = await query

    if (error) {
      console.error('[Cron List] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch executions', details: error.message },
        { status: 500 }
      )
    }

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
  } catch (error: any) {
    console.error('[Cron List] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
