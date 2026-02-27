/**
 * API Route - Cron Silver Dataset Generation Hebdomadaire
 *
 * POST /api/admin/eval/silver-cron
 * Auth: session super_admin OU CRON_SECRET
 *
 * Génère automatiquement des Silver cases depuis les queries prod
 * ayant reçu un feedback positif sur les 7 derniers jours.
 *
 * VPS crontab : 0 11 * * 1 (lundi 11h CET, après gap-cron)
 * curl -s -X POST http://localhost:3000/api/admin/eval/silver-cron \
 *   -H "x-cron-secret: $CRON_SECRET"
 *
 * @module app/api/admin/eval/silver-cron/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { generateSilverCasesFromLogs } from '@/lib/ai/silver-dataset-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export const POST = withAdminApiAuth(async (_request: NextRequest) => {
  const cronName = 'silver-generation'
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
    const result = await generateSilverCasesFromLogs({
      daysBack: 7,
      limit: 50,
      minAvgSimilarity: 0.50,
    })

    const durationMs = Date.now() - startTime
    const output = JSON.stringify({ generated: result.generated, skipped: result.skipped, durationMs })

    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'success', completed_at = NOW(), duration_ms = $1, output = $2
         WHERE id = $3`,
        [durationMs, output, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({ success: true, generated: result.generated, skipped: result.skipped, durationMs })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Silver Cron] Erreur:', errMsg)

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
