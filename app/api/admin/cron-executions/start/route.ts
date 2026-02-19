import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Démarrer une exécution de cron
 * POST /api/admin/cron-executions/start
 * Auth: session super_admin OU CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { redis } from '@/lib/cache/redis'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const POST = withAdminApiAuth(async (req: NextRequest, _ctx, _session) => {
  try {
    // Parse body
    const body = await req.json()
    const { cronName, triggerType = 'scheduled', metadata = {} } = body

    if (!cronName) {
      return NextResponse.json(
        { error: 'cronName is required' },
        { status: 400 }
      )
    }

    // Créer record d'exécution
    const result = await db.query(
      `INSERT INTO cron_executions (cron_name, status, triggered_by, metadata, started_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, cron_name, started_at`,
      [cronName, 'running', triggerType, JSON.stringify(metadata)]
    )

    if (!result.rows || result.rows.length === 0) {
      console.error('[Cron Start] Database error: No rows returned')
      return NextResponse.json(
        { error: 'Failed to create execution record' },
        { status: 500 }
      )
    }

    const execution = result.rows[0]

    console.log(`[Cron Start] ${cronName} - execution ${execution.id}`)

    // Publier événement Redis pour SSE
    try {
      const event = {
        type: 'started',
        executionId: execution.id,
        cronName: execution.cron_name,
        status: 'running',
        timestamp: new Date().toISOString(),
      }
      await redis.publish('cron:events', JSON.stringify(event))
    } catch (redisError) {
      console.error('[Cron Start] Redis publish error:', redisError)
      // Non-blocking: continue même si Redis échoue
    }

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      cronName: execution.cron_name,
      startedAt: execution.started_at,
    })
  } catch (error) {
    console.error('[Cron Start] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
