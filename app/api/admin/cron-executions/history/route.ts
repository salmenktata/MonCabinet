/**
 * API Route : Historique Exécutions d'un Cron
 * GET /api/admin/cron-executions/history?cronName=xxx&limit=5
 *
 * Retourne les N dernières exécutions d'un cron spécifique
 * Utilisé par le modal détails enrichi (S1.1)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

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

    // Paramètres
    const { searchParams } = new URL(request.url)
    const cronName = searchParams.get('cronName')
    const limit = parseInt(searchParams.get('limit') || '5')

    if (!cronName) {
      return NextResponse.json(
        { success: false, error: 'cronName requis' },
        { status: 400 }
      )
    }

    // Query : 5 dernières exécutions du cron
    const result = await db.query(
      `SELECT
        id,
        cron_name,
        status,
        started_at,
        completed_at,
        duration_ms,
        exit_code,
        output,
        error_message,
        triggered_by
      FROM cron_executions
      WHERE cron_name = $1
      ORDER BY started_at DESC
      LIMIT $2`,
      [cronName, Math.min(limit, 20)] // Max 20 pour éviter surcharge
    )

    // Calculer statistiques sur ces exécutions
    const executions = result.rows
    const stats = {
      total: executions.length,
      completed: executions.filter((e) => e.status === 'completed').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      avgDuration:
        executions.length > 0
          ? Math.round(
              executions
                .filter((e) => e.duration_ms)
                .reduce((sum, e) => sum + (e.duration_ms || 0), 0) /
                executions.filter((e) => e.duration_ms).length
            )
          : 0,
    }

    return NextResponse.json({
      success: true,
      cronName,
      executions,
      stats,
    })
  } catch (error: any) {
    console.error('[Cron Executions History API] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
