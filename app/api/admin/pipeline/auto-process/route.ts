/**
 * POST /api/admin/pipeline/auto-process
 * Traitement automatique en masse des documents en attente de validation.
 *
 * Phase 1 — Auto-advance : avance tous les docs éligibles jusqu'à rag_active
 * Phase 2 — Auto-reject  : rejette les docs avec quality_score < autoRejectBelow
 *
 * Body: {
 *   dryRun?: boolean         // default false — ne modifie rien, compte seulement
 *   limit?: number           // default 200, max 500
 *   autoRejectBelow?: number // default 40 — rejette si quality_score < N
 *   stages?: string[]        // stages à traiter (défaut: tous intermédiaires)
 * }
 *
 * Auth: withAdminApiAuth (session super_admin OU CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import {
  autoAdvanceIfEligible,
  bulkReject,
} from '@/lib/pipeline/document-pipeline-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const INTERMEDIATE_STAGES = [
  'crawled',
  'content_reviewed',
  'classified',
  'indexed',
  'quality_analyzed',
  'needs_revision',
]

export const POST = withAdminApiAuth(
  async (request: NextRequest, _ctx, session) => {
    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun === true
    const limit = Math.min(body.limit ?? 200, 500)
    const autoRejectBelow = body.autoRejectBelow ?? 40
    const stages: string[] = body.stages ?? INTERMEDIATE_STAGES

    // UUID valide ou null (performed_by en DB est de type UUID)
    const userId = (session?.user?.id && /^[0-9a-f]{8}-/i.test(session.user.id))
      ? session.user.id
      : null

    // -------------------------------------------------------------------------
    // Phase 1 — Auto-advance
    // -------------------------------------------------------------------------
    const placeholders = stages.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const advanceCandidates = await db.query(
      `SELECT id, pipeline_stage, title
       FROM knowledge_base
       WHERE pipeline_stage IN (${placeholders})
         AND is_active = true
       ORDER BY pipeline_stage_updated_at ASC
       LIMIT $${stages.length + 1}`,
      [...stages, limit]
    )

    const advanceStats = {
      advanced: 0,
      unchanged: 0,
      errors: 0,
    }

    const byStage: Record<string, number> = {}
    for (const row of advanceCandidates.rows) {
      byStage[row.pipeline_stage] = (byStage[row.pipeline_stage] ?? 0) + 1
    }

    if (!dryRun) {
      for (const doc of advanceCandidates.rows) {
        try {
          const result = await autoAdvanceIfEligible(doc.id, userId)
          if (result && result.advanced.length > 0) {
            advanceStats.advanced++
          } else {
            advanceStats.unchanged++
          }
        } catch {
          advanceStats.errors++
        }
      }
    }

    // -------------------------------------------------------------------------
    // Phase 2 — Auto-reject (quality_score < autoRejectBelow)
    // -------------------------------------------------------------------------
    const rejectCandidatesResult = await db.query(
      `SELECT id, title, quality_score::float
       FROM knowledge_base
       WHERE pipeline_stage NOT IN ('rag_active', 'rejected')
         AND quality_score IS NOT NULL
         AND quality_score < $1
         AND is_active = true
       ORDER BY quality_score ASC
       LIMIT $2`,
      [autoRejectBelow, limit]
    )

    const rejectStats = {
      rejected: 0,
      rejectErrors: 0,
    }

    if (!dryRun && rejectCandidatesResult.rows.length > 0) {
      const rejectIds = rejectCandidatesResult.rows.map((r: { id: string }) => r.id)
      const bulkResult = await bulkReject(
        rejectIds,
        (userId as unknown as string), // null si cron — performed_by nullable, géré par logHistory
        `Qualité insuffisante (score < ${autoRejectBelow}) - rejet automatique`
      )
      rejectStats.rejected = bulkResult.succeeded.length
      rejectStats.rejectErrors = bulkResult.failed.length
    }

    // -------------------------------------------------------------------------
    // Tracking cron_executions
    // -------------------------------------------------------------------------
    const stats = {
      dryRun,
      candidatesAdvance: advanceCandidates.rows.length,
      candidatesReject: rejectCandidatesResult.rows.length,
      ...advanceStats,
      ...rejectStats,
      byStage,
    }

    if (!dryRun) {
      try {
        await db.query(
          `INSERT INTO cron_executions
            (cron_name, status, started_at, completed_at, duration_ms, output, triggered_by)
           VALUES ($1, $2, NOW(), NOW(), 0, $3, $4)`,
          [
            'auto-validate-pipeline',
            'completed',
            JSON.stringify(stats),
            userId === null ? 'cron' : 'manual',
          ]
        )
      } catch {
        // Non-bloquant
      }
    }

    console.log(
      `[AutoProcess] ${dryRun ? 'DRY-RUN' : 'RÉEL'} — ` +
        `candidats advance=${advanceCandidates.rows.length}, reject=${rejectCandidatesResult.rows.length} | ` +
        `advanced=${advanceStats.advanced}, unchanged=${advanceStats.unchanged}, ` +
        `rejected=${rejectStats.rejected}, errors=${advanceStats.errors + rejectStats.rejectErrors}`
    )

    return NextResponse.json(stats)
  },
  { allowCronSecret: true }
)
