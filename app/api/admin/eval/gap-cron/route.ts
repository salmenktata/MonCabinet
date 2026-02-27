/**
 * API Route - Cron Gap Analysis Hebdomadaire
 *
 * POST /api/admin/eval/gap-cron
 * Auth: session super_admin OU CRON_SECRET
 *
 * Analyse les abstentions RAG de la semaine écoulée,
 * identifie les lacunes KB, alerte si haute priorité.
 *
 * VPS crontab : 0 10 * * 1 (lundi 10h CET)
 * curl -s -X POST http://localhost:3000/api/admin/eval/gap-cron \
 *   -H "x-cron-secret: $CRON_SECRET"
 *
 * @module app/api/admin/eval/gap-cron/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import {
  analyzeKnowledgeGaps,
  persistGaps,
  checkAndResolveGaps,
  sendGapAlertEmail,
} from '@/lib/ai/knowledge-gap-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export const POST = withAdminApiAuth(async (_request: NextRequest) => {
  const cronName = 'gap-analysis'
  const startTime = Date.now()

  // Tracking cron dans cron_executions
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
    // 1. Vérifier résolution des gaps précédents
    const resolvedCount = await checkAndResolveGaps()

    // 2. Analyser les nouveaux gaps (fenêtre 7 jours)
    const analysisResult = await analyzeKnowledgeGaps(7)

    // 3. Persister les gaps
    let newHighPriority = 0
    if (analysisResult.gaps.length > 0) {
      const persistResult = await persistGaps(analysisResult.gaps, 7)
      newHighPriority = persistResult.newHighPriority
    }

    // 4. Envoyer alerte si nouveaux gaps haute priorité
    if (newHighPriority > 0) {
      await sendGapAlertEmail(analysisResult.gaps, newHighPriority)
    }

    const durationMs = Date.now() - startTime
    const output = JSON.stringify({
      totalAbstentions: analysisResult.totalAbstentions,
      gapsFound: analysisResult.gaps.length,
      newHighPriorityGaps: newHighPriority,
      resolvedGaps: resolvedCount,
      durationMs,
    })

    // Marquer cron terminé
    if (cronExecutionId) {
      await db.query(
        `UPDATE cron_executions
         SET status = 'success', completed_at = NOW(), duration_ms = $1, output = $2
         WHERE id = $3`,
        [durationMs, output, cronExecutionId]
      ).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      period: analysisResult.period,
      totalAbstentions: analysisResult.totalAbstentions,
      gapsFound: analysisResult.gaps.length,
      newHighPriorityGaps: newHighPriority,
      resolvedGaps: resolvedCount,
      durationMs,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('[Gap Cron] Erreur:', errMsg)

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
}, { allowCronSecret: true })
