/**
 * API Route - Knowledge Gap Analysis
 *
 * GET  /api/admin/eval/gaps          → Stats + liste des gaps ouverts
 * POST /api/admin/eval/gaps          → Lance une analyse (cron ou manuel)
 * PATCH /api/admin/eval/gaps?id=xxx  → Mettre à jour le statut d'un gap (in_progress/resolved)
 *
 * @module app/api/admin/eval/gaps/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import {
  analyzeKnowledgeGaps,
  persistGaps,
  checkAndResolveGaps,
  sendGapAlertEmail,
  getKnowledgeGapStats,
} from '@/lib/ai/knowledge-gap-service'

// =============================================================================
// GET — Stats + liste
// =============================================================================

export const GET = withAdminApiAuth(async (_request: NextRequest) => {
  const stats = await getKnowledgeGapStats()
  return NextResponse.json(stats)
})

// =============================================================================
// POST — Analyse (manuel ou cron)
// =============================================================================

export const POST = withAdminApiAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}))
  const { daysBack = 7, persist = true, sendAlert = true } = body

  // Vérifier résolution des gaps précédents
  const resolvedCount = await checkAndResolveGaps()

  // Analyser les nouveaux gaps
  const analysisResult = await analyzeKnowledgeGaps(daysBack)

  let newHighPriority = 0
  if (persist && analysisResult.gaps.length > 0) {
    const persistResult = await persistGaps(analysisResult.gaps, daysBack)
    newHighPriority = persistResult.newHighPriority
  }

  // Envoyer alerte email si nouveaux gaps haute priorité
  if (sendAlert && newHighPriority > 0) {
    await sendGapAlertEmail(analysisResult.gaps, newHighPriority)
  }

  return NextResponse.json({
    success: true,
    period: analysisResult.period,
    totalAbstentions: analysisResult.totalAbstentions,
    gapsFound: analysisResult.gaps.length,
    newHighPriorityGaps: newHighPriority,
    resolvedGaps: resolvedCount,
    gaps: analysisResult.gaps,
  })
})

// =============================================================================
// PATCH — Mettre à jour le statut
// =============================================================================

export const PATCH = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { status, resolutionNotes } = body

  if (!status || !['open', 'in_progress', 'resolved'].includes(status)) {
    return NextResponse.json(
      { error: 'status doit être "open", "in_progress" ou "resolved"' },
      { status: 400 }
    )
  }

  const result = await db.query(
    `UPDATE knowledge_gaps
     SET status = $1,
         resolution_notes = COALESCE($2, resolution_notes),
         resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, domain, status`,
    [status, resolutionNotes || null, id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Gap introuvable' }, { status: 404 })
  }

  return NextResponse.json({ success: true, ...result.rows[0] })
})
