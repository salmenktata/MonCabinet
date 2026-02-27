/**
 * API Route - Gestion du Silver Dataset
 *
 * GET  /api/admin/eval/silver             → Liste les Silver cases (filtre par status/domain)
 * POST /api/admin/eval/silver             → Génère de nouveaux Silver cases depuis rag_query_log
 * PATCH /api/admin/eval/silver?id=xxx     → Valider/rejeter un Silver case
 *
 * @module app/api/admin/eval/silver/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  generateSilverCasesFromLogs,
  getSilverCases,
  getSilverStats,
} from '@/lib/ai/silver-dataset-service'
import { db } from '@/lib/db/postgres'

// =============================================================================
// GET — Liste + stats
// =============================================================================

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') as 'draft' | 'validated' | 'rejected' | null
  const domain = searchParams.get('domain') || undefined
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = parseInt(searchParams.get('offset') || '0')
  const statsOnly = searchParams.get('stats') === 'true'

  if (statsOnly) {
    const stats = await getSilverStats()
    return NextResponse.json(stats)
  }

  const [cases, stats] = await Promise.all([
    getSilverCases({ status: status || undefined, domain, limit, offset }),
    getSilverStats(),
  ])

  return NextResponse.json({ cases, stats })
})

// =============================================================================
// POST — Génération
// =============================================================================

export const POST = withAdminApiAuth(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}))
  const {
    domain,
    daysBack = 30,
    limit = 20,
    minAvgSimilarity = 0.50,
  } = body

  const result = await generateSilverCasesFromLogs({
    domain,
    daysBack,
    limit,
    minAvgSimilarity,
  })

  return NextResponse.json({
    success: true,
    generated: result.generated,
    skipped: result.skipped,
    errors: result.errors,
    cases: result.cases,
  })
})

// =============================================================================
// PATCH — Validation/Rejet par un avocat
// =============================================================================

export const PATCH = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id requis' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { status, reviewNotes, reviewedBy } = body

  if (!status || !['validated', 'rejected'].includes(status)) {
    return NextResponse.json(
      { error: 'status doit être "validated" ou "rejected"' },
      { status: 400 }
    )
  }

  const result = await db.query(
    `UPDATE rag_silver_dataset
     SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4
     RETURNING id, status`,
    [status, reviewNotes || null, reviewedBy || null, id]
  )

  if (result.rowCount === 0) {
    return NextResponse.json({ error: 'Silver case introuvable' }, { status: 404 })
  }

  return NextResponse.json({ success: true, id, status })
})
