/**
 * API Cron Complete - Marquer une exécution comme terminée
 * POST /api/admin/monitoring/crons/complete
 */

import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/db'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * Marquer une exécution de cron comme terminée
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier authentification via X-Cron-Secret
    const cronSecret = request.headers.get('X-Cron-Secret')
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { execution_id, status, duration_ms, error_message } = body

    if (!execution_id || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: execution_id, status' },
        { status: 400 }
      )
    }

    // Mettre à jour l'exécution
    const pool = getPool()
    const result = await pool.query(
      `UPDATE cron_executions
       SET
         status = $1,
         completed_at = NOW(),
         duration_ms = $2,
         error_message = $3
       WHERE id = $4
       RETURNING id, cron_name, status, duration_ms`,
      [status, duration_ms || null, error_message || null, execution_id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      execution: result.rows[0],
    })
  } catch (error) {
    console.error('[Cron Complete] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
