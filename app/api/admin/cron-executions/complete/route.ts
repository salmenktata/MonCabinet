/**
 * API: Compléter une exécution de cron
 * POST /api/admin/cron-executions/complete
 * Auth: X-Cron-Secret header
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const supabase = await createClient()

    const updateData: any = {
      status,
      completed_at: new Date().toISOString(),
      output: output || {},
    }

    if (durationMs !== undefined) {
      updateData.duration_ms = durationMs
    }

    if (errorMessage) {
      updateData.error_message = errorMessage
    }

    if (exitCode !== undefined) {
      updateData.exit_code = exitCode
    }

    const { data: execution, error } = await supabase
      .from('cron_executions')
      .update(updateData)
      .eq('id', executionId)
      .select('id, cron_name, status, duration_ms')
      .single()

    if (error) {
      console.error('[Cron Complete] Database error:', error)
      return NextResponse.json(
        { error: 'Failed to update execution record', details: error.message },
        { status: 500 }
      )
    }

    console.log(
      `[Cron Complete] ${execution.cron_name} - ${status} (${execution.duration_ms}ms)`
    )

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
