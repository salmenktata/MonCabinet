/**
 * POST /api/admin/kb/analyze-quality-batch
 *
 * Soumet un batch de documents KB pour analyse qualité via Groq Batch API.
 * Traitement asynchrone sur 24h, -50% de coût vs API sync.
 *
 * Body params:
 * - batchSize       (default: 500)   Nombre max de documents par batch
 * - category        (optional)       Filtrer par catégorie
 * - skipAnalyzed    (default: true)  Ignorer les docs déjà analysés
 * - includeFailedScores (default: false) Inclure les docs avec score=50 (échecs)
 *
 * Retourne: { batchJobId, groqBatchId, totalDocuments }
 *
 * ---
 *
 * GET /api/admin/kb/analyze-quality-batch
 *
 * Liste les batches en DB avec leur statut Groq.
 * Avec ?process=true : vérifie les batches en attente et traite les complétés.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { db } from '@/lib/db/postgres'
import {
  submitKBQualityBatch,
  checkAndProcessAllPendingBatches,
  checkAndProcessBatch,
} from '@/lib/kb/kb-quality-batch-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '500', 10), 2000)
    const category = body.category || undefined
    const skipAnalyzed = body.skipAnalyzed !== false
    const includeFailedScores = body.includeFailedScores === true

    console.log('[KB Quality Batch] Soumission:', { batchSize, category, skipAnalyzed, includeFailedScores })

    const result = await submitKBQualityBatch({
      batchSize,
      category,
      skipAnalyzed,
      includeFailedScores,
    })

    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    console.error('[KB Quality Batch] Erreur soumission:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})

export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const { searchParams } = new URL(request.url)
    const process = searchParams.get('process') === 'true'
    const batchJobId = searchParams.get('id')

    // Traiter un batch spécifique
    if (batchJobId) {
      const result = await checkAndProcessBatch(batchJobId)
      return NextResponse.json(result)
    }

    // Traiter tous les batches en attente
    if (process) {
      const results = await checkAndProcessAllPendingBatches()
      return NextResponse.json({ success: true, results })
    }

    // Lister les jobs batch depuis la DB
    const jobsResult = await db.query<{
      id: string
      groq_batch_id: string
      operation: string
      status: string
      total_requests: number
      completed_requests: number
      failed_requests: number
      created_at: string
      completed_at: string | null
    }>(
      `SELECT id, groq_batch_id, operation, status, total_requests,
              completed_requests, failed_requests, created_at, completed_at
       FROM groq_batch_jobs
       ORDER BY created_at DESC
       LIMIT 50`
    )

    return NextResponse.json({
      success: true,
      batches: jobsResult.rows.map(row => ({
        id: row.id,
        groqBatchId: row.groq_batch_id,
        operation: row.operation,
        status: row.status,
        totalRequests: row.total_requests,
        completedRequests: row.completed_requests,
        failedRequests: row.failed_requests,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
    })
  } catch (error) {
    console.error('[KB Quality Batch] Erreur GET:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
