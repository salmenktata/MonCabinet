/**
 * API Route - Cron TTL Cleanup rag_query_log
 *
 * POST /api/admin/eval/log-cleanup
 * Auth: session super_admin OU CRON_SECRET
 *
 * Purge les entrées rag_query_log de plus de 90 jours.
 * Évite la croissance infinie de la table.
 *
 * VPS crontab : 0 2 1 * * (1er du mois, 2h CET)
 * curl -s -X POST http://localhost:3000/api/admin/eval/log-cleanup \
 *   -H "x-cron-secret: $CRON_SECRET"
 *
 * @module app/api/admin/eval/log-cleanup/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withAdminApiAuth(async (_request: NextRequest) => {
  const cronName = 'log-cleanup'
  const startTime = Date.now()

  let cronExecutionId: string | null = null
  try {
    const exec = await db.query(
      `INSERT INTO cron_executions (cron_name, status, started_at, triggered_by)
       VALUES ($1, 'running', NOW(), 'cron')
       RETURNING id`,
      [cronName]
    )
    cronExecutionId = exec.rows[0]?.id
  } catch {
    // Ne pas bloquer si le tracking échoue
  }

  try {
    // Purge rag_query_log > 90 jours
    const logResult = await db.query(
      `DELETE FROM rag_query_log
       WHERE created_at < NOW() - INTERVAL '90 days'
       RETURNING id`
    )
    const deletedLogs = logResult.rowCount ?? 0

    // Purge expert_review_queue dismissed > 30 jours
    const queueResult = await db.query(
      `DELETE FROM expert_review_queue
       WHERE status IN ('dismissed', 'reviewed')
         AND created_at < NOW() - INTERVAL '30 days'
       RETURNING id`
    )
    const deletedQueue = queueResult.rowCount ?? 0

    const durationMs = Date.now() - startTime
    const output = JSON.stringify({ deletedLogs, deletedQueue, durationMs })

    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'success', completed_at = NOW(), duration_ms = $1, output = $2
         WHERE id = $3`,
        [durationMs, output, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({ success: true, deletedLogs, deletedQueue, durationMs })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Log Cleanup] Erreur:', errMsg)

    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'error', completed_at = NOW(),
             duration_ms = $1, error_message = $2
         WHERE id = $3`,
        [Date.now() - startTime, errMsg, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
})
