/**
 * API: Configuration et métriques des crons schedulés
 * GET /api/admin/cron-schedules
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

    // 2. Récupérer via vue dashboard
    const supabase = await createClient()

    const { data: schedules, error } = await supabase
      .from('vw_cron_monitoring_dashboard')
      .select('*')
      .order('last_execution_at', { ascending: false, nullsFirst: false })

    if (error) {
      console.error('[Cron Schedules] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch schedules', details: error.message },
        { status: 500 }
      )
    }

    // 3. Calculer stats globales
    const totalSchedules = schedules?.length || 0
    const enabledSchedules = schedules?.filter((s) => s.is_enabled).length || 0
    const runningNow = schedules?.reduce((sum, s) => sum + (s.running_count || 0), 0) || 0
    const recentFailures = schedules?.reduce((sum, s) => sum + (s.failures_24h || 0), 0) || 0
    const avgSuccessRate =
      schedules && schedules.length > 0
        ? schedules.reduce((sum, s) => sum + (s.success_rate_7d || 0), 0) / schedules.length
        : 0

    return NextResponse.json({
      success: true,
      schedules: schedules || [],
      summary: {
        totalSchedules,
        enabledSchedules,
        runningNow,
        recentFailures,
        avgSuccessRate: Math.round(avgSuccessRate * 100) / 100,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Cron Schedules] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
