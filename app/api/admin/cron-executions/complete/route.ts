/**
 * API: Compléter une exécution de cron
 * POST /api/admin/cron-executions/complete
 * Auth: X-Cron-Secret header
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { redis } from '@/lib/cache/redis'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  try {
    // 1. Vérification auth
    const authHeader = req.headers.get('x-cron-secret')
    if (!authHeader || authHeader !== CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 2. Parse body
    const body = await req.json()
    const {
      executionId,
      status = 'completed',
      durationMs,
      output = {},
      errorMessage,
      exitCode,
    } = body

    if (!executionId) {
      return NextResponse.json(
        { error: 'executionId is required' },
        { status: 400 }
      )
    }

    if (!['completed', 'failed', 'cancelled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be: completed, failed, or cancelled' },
        { status: 400 }
      )
    }

    // 3. Mettre à jour le record
    const result = await db.query(
      `UPDATE cron_executions
       SET status = $1,
           completed_at = NOW(),
           duration_ms = $2,
           output = $3,
           error_message = $4,
           exit_code = $5
       WHERE id = $6
       RETURNING id, cron_name, status, duration_ms`,
      [
        status,
        durationMs || null,
        JSON.stringify(output || {}),
        errorMessage || null,
        exitCode !== undefined ? exitCode : null,
        executionId,
      ]
    )

    if (!result.rows || result.rows.length === 0) {
      console.error('[Cron Complete] Database error: Execution not found')
      return NextResponse.json(
        { error: 'Execution not found' },
        { status: 404 }
      )
    }

    const execution = result.rows[0]

    console.log(
      `[Cron Complete] ${execution.cron_name} - ${status} (${execution.duration_ms}ms)`
    )

    // 4. Publier événement Redis pour SSE
    try {
      const event = {
        type: status === 'completed' ? 'completed' : 'failed',
        executionId: execution.id,
        cronName: execution.cron_name,
        status: execution.status,
        durationMs: execution.duration_ms,
        errorMessage: errorMessage || null,
        timestamp: new Date().toISOString(),
      }
      await redis.publish('cron:events', JSON.stringify(event))
    } catch (redisError) {
      console.error('[Cron Complete] Redis publish error:', redisError)
      // Non-blocking: continue même si Redis échoue
    }

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      cronName: execution.cron_name,
      status: execution.status,
      durationMs: execution.duration_ms,
    })
  } catch (error: any) {
    console.error('[Cron Complete] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
