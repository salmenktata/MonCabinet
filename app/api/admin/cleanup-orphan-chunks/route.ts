/**
 * POST /api/admin/cleanup-orphan-chunks
 *
 * Supprime les chunks de knowledge_base_chunks dont le document parent
 * n'existe plus dans knowledge_base (chunks orphelins).
 * Tracke l'exécution dans cron_executions.
 *
 * GET /api/admin/cleanup-orphan-chunks
 * Dry-run : compte les chunks orphelins sans supprimer.
 *
 * VPS crontab : 30 3 1 * * (1er du mois, 3h30 CET)
 * curl -s -X POST http://localhost:3000/api/admin/cleanup-orphan-chunks \
 *   -H "X-Cron-Secret: $CRON_SECRET"
 */
import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withAdminApiAuth(async (_req: NextRequest) => {
  const cronName = 'cleanup-orphan-chunks'
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
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM knowledge_base_chunks
      WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
    `)
    const count = parseInt(countResult.rows[0].count, 10)

    if (count > 0) {
      await db.query(`
        DELETE FROM knowledge_base_chunks
        WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
      `)
    }

    const durationMs = Date.now() - startTime
    const output = JSON.stringify({ deleted: count, durationMs })

    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'completed', completed_at = NOW(), duration_ms = $1, output = $2
         WHERE id = $3`,
        [durationMs, output, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      deleted: count,
      message: count === 0 ? 'Aucun chunk orphelin trouvé' : `${count} chunks orphelins supprimés`,
      durationMs,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[cleanup-orphan-chunks] Error:', errMsg)

    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'failed', completed_at = NOW(),
             duration_ms = $1, error_message = $2
         WHERE id = $3`,
        [Date.now() - startTime, errMsg, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({ success: false, error: errMsg }, { status: 500 })
  }
}, { allowCronSecret: true })

/**
 * GET /api/admin/cleanup-orphan-chunks
 * Dry-run : compte les chunks orphelins sans supprimer.
 */
export const GET = withAdminApiAuth(async (_req: NextRequest) => {
  const result = await db.query(`
    SELECT COUNT(*) as count
    FROM knowledge_base_chunks
    WHERE knowledge_base_id NOT IN (SELECT id FROM knowledge_base)
  `)

  return NextResponse.json({
    orphanedChunks: parseInt(result.rows[0].count, 10),
  })
}, { allowCronSecret: true })
