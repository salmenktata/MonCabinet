/**
 * API Cron Start - Créer une nouvelle exécution de cron
 * POST /api/admin/monitoring/crons/start
 */

import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

/**
 * Démarrer une nouvelle exécution de cron
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
    const { cron_name } = body

    if (!cron_name) {
      return NextResponse.json(
        { error: 'Missing required field: cron_name' },
        { status: 400 }
      )
    }

    // Créer une nouvelle exécution
    const result = await pool.query(
      `INSERT INTO cron_executions (cron_name, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING id, cron_name, status, started_at`,
      [cron_name]
    )

    return NextResponse.json({
      success: true,
      execution_id: result.rows[0].id,
      execution: result.rows[0],
    })
  } catch (error: any) {
    console.error('[Cron Start] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
