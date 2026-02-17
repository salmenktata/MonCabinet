import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Mark scheduled cron as failed
 * PATCH /api/admin/cron-executions/schedule/[id]/failed
 * Auth: X-Cron-Secret (internal only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

const CRON_SECRET = process.env.CRON_SECRET

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Vérification auth
    const authHeader = req.headers.get('x-cron-secret')
    if (!authHeader || authHeader !== CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const body = await req.json()
    const { error } = body

    await db.query(
      `UPDATE scheduled_cron_executions
       SET status = 'failed', triggered_at = NOW(), error_message = $2
       WHERE id = $1 AND status = 'pending'`,
      [id, error || 'Unknown error']
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Mark Failed] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
