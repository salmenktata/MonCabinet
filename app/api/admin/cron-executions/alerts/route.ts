/**
 * API Route : Alertes Patterns Intelligentes
 * GET /api/admin/cron-executions/alerts
 *
 * Détecte des patterns anormaux dans les exécutions de crons :
 * - Dégradation durée +50%
 * - Intermittence (alternance succès/échec)
 * - Timeouts répétés
 * S1.3 : Alertes Patterns Intelligentes
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

interface Alert {
  id: string
  cronName: string
  severity: 'critical' | 'warning' | 'info'
  pattern: 'degradation' | 'intermittent' | 'timeout' | 'stuck'
  title: string
  description: string
  metrics: {
    current: number
    previous: number
    change: number
  }
  detectedAt: string
}

export async function GET(request: NextRequest) {
  try {
    // Auth : Admin seulement
    const session = await getSession()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const alerts: Alert[] = []

    // 1. PATTERN : Dégradation durée +50%
    const degradationResult = await db.query(
      `WITH recent_durations AS (
        SELECT
          cron_name,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS avg_24h,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days' AND started_at < NOW() - INTERVAL '24 hours') AS avg_previous
        FROM cron_executions
        WHERE status = 'completed'
          AND duration_ms IS NOT NULL
          AND started_at >= NOW() - INTERVAL '7 days'
        GROUP BY cron_name
      )
      SELECT
        cron_name,
        avg_24h,
        avg_previous,
        ((avg_24h - avg_previous) / NULLIF(avg_previous, 0) * 100) AS change_pct
      FROM recent_durations
      WHERE avg_previous > 0
        AND ((avg_24h - avg_previous) / avg_previous) > 0.5
      ORDER BY change_pct DESC`
    )

    degradationResult.rows.forEach((row) => {
      alerts.push({
        id: `degradation-${row.cron_name}`,
        cronName: row.cron_name,
        severity: row.change_pct > 100 ? 'critical' : 'warning',
        pattern: 'degradation',
        title: `Dégradation durée +${Math.round(row.change_pct)}%`,
        description: `Durée moyenne passée de ${Math.round(row.avg_previous)}ms à ${Math.round(row.avg_24h)}ms en 24h`,
        metrics: {
          current: Math.round(row.avg_24h),
          previous: Math.round(row.avg_previous),
          change: Math.round(row.change_pct),
        },
        detectedAt: new Date().toISOString(),
      })
    })

    // 2. PATTERN : Intermittence (alternance succès/échec)
    const intermittentResult = await db.query(
      `WITH last_10 AS (
        SELECT
          cron_name,
          status,
          ROW_NUMBER() OVER (PARTITION BY cron_name ORDER BY started_at DESC) AS rn
        FROM cron_executions
        WHERE started_at >= NOW() - INTERVAL '24 hours'
      ),
      transitions AS (
        SELECT
          cron_name,
          COUNT(*) AS total_executions,
          SUM(CASE WHEN status <> LAG(status) OVER (PARTITION BY cron_name ORDER BY rn) THEN 1 ELSE 0 END) AS status_changes
        FROM last_10
        WHERE rn <= 10
        GROUP BY cron_name
      )
      SELECT
        cron_name,
        total_executions,
        status_changes,
        (status_changes::float / NULLIF(total_executions - 1, 0)) AS transition_rate
      FROM transitions
      WHERE status_changes >= 3
        AND total_executions >= 5
      ORDER BY transition_rate DESC`
    )

    intermittentResult.rows.forEach((row) => {
      alerts.push({
        id: `intermittent-${row.cron_name}`,
        cronName: row.cron_name,
        severity: row.status_changes >= 5 ? 'critical' : 'warning',
        pattern: 'intermittent',
        title: `Intermittence détectée`,
        description: `${row.status_changes} changements de statut sur ${row.total_executions} exécutions récentes`,
        metrics: {
          current: row.status_changes,
          previous: row.total_executions,
          change: Math.round(row.transition_rate * 100),
        },
        detectedAt: new Date().toISOString(),
      })
    })

    // 3. PATTERN : Timeouts répétés (exit code 124 ou 143)
    const timeoutsResult = await db.query(
      `SELECT
        cron_name,
        COUNT(*) AS timeout_count,
        MAX(started_at) AS last_timeout
      FROM cron_executions
      WHERE started_at >= NOW() - INTERVAL '24 hours'
        AND (exit_code = 124 OR exit_code = 143)
      GROUP BY cron_name
      HAVING COUNT(*) >= 3
      ORDER BY timeout_count DESC`
    )

    timeoutsResult.rows.forEach((row) => {
      alerts.push({
        id: `timeout-${row.cron_name}`,
        cronName: row.cron_name,
        severity: row.timeout_count >= 5 ? 'critical' : 'warning',
        pattern: 'timeout',
        title: `${row.timeout_count} timeouts répétés`,
        description: `Dernier timeout: ${new Date(row.last_timeout).toLocaleString('fr-FR')}`,
        metrics: {
          current: row.timeout_count,
          previous: 0,
          change: row.timeout_count,
        },
        detectedAt: new Date().toISOString(),
      })
    })

    // 4. PATTERN : Crons stuck (running > timeout normal)
    const stuckResult = await db.query(
      `SELECT
        e.cron_name,
        e.id,
        e.started_at,
        EXTRACT(EPOCH FROM (NOW() - e.started_at))::int AS running_seconds,
        s.timeout_minutes
      FROM cron_executions e
      JOIN cron_schedules s ON e.cron_name = s.cron_name
      WHERE e.status = 'running'
        AND e.started_at < NOW() - (INTERVAL '1 minute' * s.timeout_minutes)
      ORDER BY running_seconds DESC`
    )

    stuckResult.rows.forEach((row) => {
      alerts.push({
        id: `stuck-${row.id}`,
        cronName: row.cron_name,
        severity: 'critical',
        pattern: 'stuck',
        title: `Cron bloqué depuis ${Math.floor(row.running_seconds / 60)}min`,
        description: `Timeout dépassé (max: ${row.timeout_minutes}min)`,
        metrics: {
          current: row.running_seconds,
          previous: row.timeout_minutes * 60,
          change: Math.round((row.running_seconds / (row.timeout_minutes * 60) - 1) * 100),
        },
        detectedAt: new Date().toISOString(),
      })
    })

    // Statistiques globales
    const stats = {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === 'critical').length,
      warning: alerts.filter((a) => a.severity === 'warning').length,
      info: alerts.filter((a) => a.severity === 'info').length,
      byPattern: {
        degradation: alerts.filter((a) => a.pattern === 'degradation').length,
        intermittent: alerts.filter((a) => a.pattern === 'intermittent').length,
        timeout: alerts.filter((a) => a.pattern === 'timeout').length,
        stuck: alerts.filter((a) => a.pattern === 'stuck').length,
      },
    }

    return NextResponse.json({
      success: true,
      alerts,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[Cron Alerts API] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
