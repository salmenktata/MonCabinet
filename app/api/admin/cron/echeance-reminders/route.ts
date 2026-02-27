/**
 * Cron : Rappels automatiques d'échéances
 * POST /api/admin/cron/echeance-reminders
 *
 * Horaire VPS : 0 6 * * * (tous les jours à 6h CET)
 *
 * Envoie un email groupé aux utilisateurs qui ont des échéances à J-15, J-7, J-3 ou J-1
 * en fonction des préférences rappel (rappel_j* sur l'échéance + alerte_j*_enabled sur le user).
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { sendEcheanceReminders } from '@/lib/notifications/echeance-reminders-service'
import { createLogger } from '@/lib/logger'

const log = createLogger('Cron:EcheanceReminders')

export const maxDuration = 120

export const POST = withAdminApiAuth(async () => {
  const startedAt = Date.now()
  log.info('Démarrage cron echeance-reminders')

  const stats = await sendEcheanceReminders()
  const duration = Date.now() - startedAt

  const status = stats.emailsFailed > 0 ? 'error' : 'success'
  const output = `echeance-reminders: sent=${stats.emailsSent}, skipped=${stats.skipped}, failed=${stats.emailsFailed}, users=${stats.totalUsers}, echeances=${stats.echeancesFound} (${duration}ms)`
  log.info(output)

  db.query(
    `INSERT INTO cron_executions (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
     VALUES ('echeance-reminders', $1, NOW() - ($2 || ' milliseconds')::interval, NOW(), $2, $3, 'cron')`,
    [status, duration, output]
  ).catch(() => null)

  return NextResponse.json({ success: true, ...stats, durationMs: duration })
})
