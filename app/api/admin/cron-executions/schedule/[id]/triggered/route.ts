import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API: Mark scheduled cron as triggered
 * PATCH /api/admin/cron-executions/schedule/[id]/triggered
 * Auth: X-Cron-Secret (internal only)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

export const PATCH = withAdminApiAuth(async (req, ctx, _session) => {
  try {
    const { id } = await ctx.params!

    await db.query(
      `UPDATE scheduled_cron_executions
       SET status = 'triggered', triggered_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Mark Triggered] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
