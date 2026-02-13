/**
 * API: Stats agrégées des exécutions de crons
 * GET /api/admin/cron-executions/stats?hours=24
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
    const hours = parseInt(searchParams.get('hours') || '24', 10)

    if (hours < 1 || hours > 168) {
      return NextResponse.json(
        { error: 'hours must be between 1 and 168 (7 days)' },
        { status: 400 }
      )
    }

    // 3. Récupérer stats via fonction SQL
    const supabase = await createClient()

    const { data: stats, error } = await supabase.rpc(
      'get_cron_monitoring_stats',
      { hours_back: hours }
    )

    if (error) {
      console.error('[Cron Stats] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch stats', details: error.message },
        { status: 500 }
      )
    }

    // 4. Récupérer timeline (par jour pour graph)
    const { data: timeline, error: timelineError } = await supabase
      .from('cron_executions')
      .select('cron_name, status, started_at')
      .gte('started_at', new Date(Date.now() - hours * 3600 * 1000).toISOString())
      .order('started_at', { ascending: true })

    if (timelineError) {
      console.error('[Cron Stats] Timeline error:', timelineError)
    }

    // 5. Grouper timeline par jour
    const timelineByDay: Record<string, any> = {}

    timeline?.forEach((exec) => {
      const day = new Date(exec.started_at).toISOString().split('T')[0]
      if (!timelineByDay[day]) {
        timelineByDay[day] = {
          date: day,
          completed: 0,
          failed: 0,
          running: 0,
          total: 0,
        }
      }
      timelineByDay[day][exec.status] = (timelineByDay[day][exec.status] || 0) + 1
      timelineByDay[day].total += 1
    })

    const timelineArray = Object.values(timelineByDay).sort((a: any, b: any) =>
      a.date.localeCompare(b.date)
    )

    // 6. Détecter crons bloqués
    const { data: stuckCrons, error: stuckError } = await supabase.rpc(
      'detect_stuck_crons'
    )

    if (stuckError) {
      console.error('[Cron Stats] Stuck detection error:', stuckError)
    }

    return NextResponse.json({
      success: true,
      stats: stats || [],
      timeline: timelineArray,
      stuckCrons: stuckCrons || [],
      hoursBack: hours,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Cron Stats] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
