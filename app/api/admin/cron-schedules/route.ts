import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Configuration et métriques des crons schedulés
 * GET /api/admin/cron-schedules
 * Auth: Session admin
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    // 1. Récupérer via vue dashboard
    const result = await db.query(`
      SELECT * FROM vw_cron_monitoring_dashboard
      ORDER BY last_execution_at DESC NULLS LAST
    `)
    const schedules = result.rows

    // 2. Calculer stats globales
    const totalSchedules = schedules.length
    const enabledSchedules = schedules.filter((s) => s.is_enabled).length
    const runningNow = schedules.reduce((sum, s) => sum + (s.running_count || 0), 0)
    const recentFailures = schedules.reduce((sum, s) => sum + (s.failures_24h || 0), 0)
    const avgSuccessRate =
      schedules.length > 0
        ? schedules.reduce((sum, s) => sum + (parseFloat(s.success_rate_7d) || 0), 0) /
          schedules.length
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
  } catch (error) {
    console.error('[Cron Schedules] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
