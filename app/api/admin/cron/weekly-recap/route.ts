/**
 * Cron : Récapitulatif hebdomadaire
 * POST /api/admin/cron/weekly-recap
 *
 * Horaire VPS : 0 8 * * 1 (chaque lundi à 8h CET)
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { sendWeeklyRecapNotifications } from '@/lib/notifications/weekly-recap-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('Cron:WeeklyRecap')

export const maxDuration = 120

export const POST = withAdminApiAuth(async () => {
  const startedAt = Date.now()
  log.info('Démarrage cron weekly-recap')

  const stats = await sendWeeklyRecapNotifications()
  const duration = Date.now() - startedAt

  const status = stats.emailsFailed > 0 ? 'error' : 'success'
  const output = `weekly-recap: sent=${stats.emailsSent}, skipped=${stats.skipped}, failed=${stats.emailsFailed}, total=${stats.totalUsers} (${duration}ms)`
  log.info(output)

  // Logger dans cron_executions
  db.query(
    `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
     VALUES ('weekly-recap', $1, NOW() - ($2 || ' milliseconds')::interval, NOW(), $2, $3, 'cron')`,
    [status, duration, output]
  ).catch(() => null)

  return NextResponse.json({ success: true, ...stats, durationMs: duration })
})
