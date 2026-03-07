/**
 * GET /api/admin/analytics/peak-hours
 * Horaires peak : heatmap 7×24, courbe aujourd'hui vs semaine, créneau peak
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

    const [heatmapResult, todayResult, weekAvgResult, peakResult] = await Promise.all([
      // Heatmap 7×24 (30 derniers jours)
      query(`
        SELECT
          EXTRACT(DOW FROM created_at)::int AS dow,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS count
        FROM rag_query_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1, 2
        ORDER BY 1, 2
      `),
      // Aujourd'hui par heure
      query(`
        SELECT
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS count
        FROM rag_query_log
        WHERE created_at >= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1
      `),
      // Moyenne par heure sur les 30 derniers jours
      query(`
        SELECT
          EXTRACT(HOUR FROM created_at)::int AS hour,
          ROUND(COUNT(*)::float / GREATEST(COUNT(DISTINCT DATE(created_at)), 1), 1) AS avg_count
        FROM rag_query_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1
        ORDER BY 1
      `),
      // Créneau peak (day + hour avec le plus de requêtes sur 30j)
      query(`
        SELECT
          EXTRACT(DOW FROM created_at)::int AS dow,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS count
        FROM rag_query_log
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY 1, 2
        ORDER BY count DESC
        LIMIT 1
      `),
    ])

    const DOW_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']
    const peak = peakResult.rows[0]

    return NextResponse.json({
      success: true,
      heatmap: heatmapResult.rows,
      today_by_hour: todayResult.rows,
      week_avg_by_hour: weekAvgResult.rows,
      peak: peak
        ? {
            dow: peak.dow,
            hour: peak.hour,
            count: peak.count,
            label: `${DOW_LABELS[peak.dow]} ${peak.hour}h–${peak.hour + 1}h`,
          }
        : null,
    })
  } catch (error) {
    console.error('[Analytics Peak Hours] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
