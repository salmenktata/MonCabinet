/**
 * POST /api/admin/pipeline/auto-advance
 * Tente l'auto-advance sur les docs éligibles d'un ou plusieurs stages.
 * Peut être appelé par un admin ou par un cron (X-Cron-Secret).
 *
 * Body: { stages?: string[], limit?: number, dryRun?: boolean }
 * - stages: filtrer par stage (défaut: tous les stages non-terminaux)
 * - limit: max docs à traiter (défaut: 100)
 * - dryRun: si true, ne fait que compter les éligibles sans avancer
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { autoAdvanceIfEligible } from '@/lib/pipeline/document-pipeline-service'

async function checkAccess(request: NextRequest, userId?: string): Promise<boolean> {
  // Cron access via secret
  const cronSecret = request.headers.get('x-cron-secret')
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return true

  // Admin access
  if (!userId) return false
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!(await checkAccess(request, session?.user?.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const stages = body.stages || ['crawled', 'content_reviewed', 'classified', 'indexed', 'quality_analyzed']
    const limit = Math.min(body.limit || 100, 500)
    const dryRun = body.dryRun === true

    // Récupérer les docs candidats
    const placeholders = stages.map((_: string, i: number) => `$${i + 1}`).join(', ')
    const docsResult = await db.query(
      `SELECT id, pipeline_stage, title
      FROM knowledge_base
      WHERE pipeline_stage IN (${placeholders})
        AND is_active = true
      ORDER BY pipeline_stage_updated_at ASC
      LIMIT $${stages.length + 1}`,
      [...stages, limit]
    )

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        candidateCount: docsResult.rows.length,
        byStage: stages.reduce((acc: Record<string, number>, stage: string) => {
          acc[stage] = docsResult.rows.filter((r: { pipeline_stage: string }) => r.pipeline_stage === stage).length
          return acc
        }, {}),
      })
    }

    const userId = session?.user?.id || 'system-auto-advance'
    const results = {
      processed: 0,
      advanced: 0,
      unchanged: 0,
      errors: 0,
      details: [] as Array<{ id: string; from: string; to: string; stages: string[] }>,
    }

    for (const doc of docsResult.rows) {
      results.processed++
      try {
        const result = await autoAdvanceIfEligible(doc.id, userId)
        if (result && result.advanced.length > 0) {
          results.advanced++
          results.details.push({
            id: doc.id,
            from: doc.pipeline_stage,
            to: result.stoppedAt,
            stages: result.advanced,
          })
        } else {
          results.unchanged++
        }
      } catch (error) {
        results.errors++
        console.error(`[AutoAdvance] Erreur doc ${doc.id}:`, error)
      }
    }

    console.log(`[AutoAdvance] Batch terminé: ${results.advanced} avancés, ${results.unchanged} inchangés, ${results.errors} erreurs sur ${results.processed} traités`)

    return NextResponse.json(results)
  } catch (error) {
    console.error('[Pipeline API] Erreur auto-advance:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
