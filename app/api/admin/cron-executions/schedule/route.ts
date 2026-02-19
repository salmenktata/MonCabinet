import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Schedule Cron for Future Execution
 * POST /api/admin/cron-executions/schedule
 * GET /api/admin/cron-executions/schedule (list scheduled)
 * DELETE /api/admin/cron-executions/schedule?id=xxx (cancel)
 * Auth: Session admin (Next-Auth)
 * Phase 6.1: Scheduling Custom
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { validateCronParameters } from '@/lib/cron/cron-parameters'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

// POST: Planifier un cron pour exécution future
export const POST = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    const body = await req.json()
    const { cronName, scheduledAt, parameters = {}, createdBy } = body

    // Validation inputs
    if (!cronName || typeof cronName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'cronName is required' },
        { status: 400 }
      )
    }

    if (!scheduledAt) {
      return NextResponse.json(
        { success: false, error: 'scheduledAt is required (ISO 8601 timestamp)' },
        { status: 400 }
      )
    }

    // Valider que scheduledAt est dans le futur
    const scheduledDate = new Date(scheduledAt)
    const now = new Date()

    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid scheduledAt format. Use ISO 8601.' },
        { status: 400 }
      )
    }

    if (scheduledDate <= now) {
      return NextResponse.json(
        { success: false, error: 'scheduledAt must be in the future' },
        { status: 400 }
      )
    }

    // Phase 6.2: Valider les paramètres si présents
    const validation = validateCronParameters(cronName, parameters)
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid parameters',
          validationErrors: validation.errors,
        },
        { status: 400 }
      )
    }

    // Insérer dans la table
    const result = await db.query(
      `INSERT INTO scheduled_cron_executions (cron_name, scheduled_at, parameters, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, cron_name, scheduled_at, parameters, created_by, created_at, status`,
      [cronName, scheduledDate.toISOString(), JSON.stringify(parameters), createdBy || 'admin']
    )

    const scheduled = result.rows[0]

    console.log(
      `[Schedule Cron] ✅ ${cronName} planifié pour ${scheduledDate.toISOString()} (ID: ${scheduled.id})`
    )

    return NextResponse.json({
      success: true,
      scheduled: {
        id: scheduled.id,
        cronName: scheduled.cron_name,
        scheduledAt: scheduled.scheduled_at,
        parameters: scheduled.parameters,
        createdBy: scheduled.created_by,
        createdAt: scheduled.created_at,
        status: scheduled.status,
      },
    })
  } catch (error) {
    console.error('[Schedule Cron] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
})

// GET: Lister les crons planifiés
export const GET = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'pending' // 'pending', 'all'

    let query = `SELECT * FROM vw_scheduled_crons_summary`
    const params: any[] = []

    if (status !== 'all') {
      query += ` WHERE status = $1`
      params.push(status)
    }

    query += ` ORDER BY scheduled_at ASC LIMIT 100`

    const result = await db.query(query, params)

    return NextResponse.json({
      success: true,
      scheduled: result.rows,
      count: result.rows.length,
    })
  } catch (error) {
    console.error('[List Scheduled Crons] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
})

// DELETE: Annuler un cron planifié
export const DELETE = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'id parameter is required' },
        { status: 400 }
      )
    }

    // Vérifier que le cron est encore pending
    const checkResult = await db.query(
      `SELECT id, cron_name, status FROM scheduled_cron_executions WHERE id = $1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Scheduled cron not found' },
        { status: 404 }
      )
    }

    const scheduled = checkResult.rows[0]

    if (scheduled.status !== 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot cancel cron with status: ${scheduled.status}`,
        },
        { status: 400 }
      )
    }

    // Marquer comme cancelled
    await db.query(
      `UPDATE scheduled_cron_executions
       SET status = 'cancelled', triggered_at = NOW()
       WHERE id = $1`,
      [id]
    )

    console.log(`[Cancel Scheduled Cron] ✅ ${scheduled.cron_name} (ID: ${id}) cancelled`)

    return NextResponse.json({
      success: true,
      message: `Scheduled cron cancelled`,
      cronName: scheduled.cron_name,
    })
  } catch (error) {
    console.error('[Cancel Scheduled Cron] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
