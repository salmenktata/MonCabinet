import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Route : Retry Failed Batches
 * POST /api/admin/batches/retry
 *
 * Relance les jobs échoués d'un batch
 * S1.2 : Actions Batches
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export async function POST(request: NextRequest) {
  try {
    // Auth : Admin seulement
    const session = await getSession()
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { batchType } = body

    if (!batchType) {
      return NextResponse.json(
        { success: false, error: 'batchType requis' },
        { status: 400 }
      )
    }

    let retriedCount = 0

    switch (batchType) {
      case 'kb-indexation':
        // Relancer les indexations échouées (failed)
        const kbResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'pending',
               retry_count = COALESCE(retry_count, 0) + 1,
               updated_at = NOW()
           WHERE status = 'failed'
             AND job_type = 'index_documents'
             AND COALESCE(retry_count, 0) < 3
           RETURNING id`
        )
        retriedCount = kbResult.rowCount || 0
        break

      case 'web-crawls':
        // Relancer les pages échouées
        const crawlResult = await db.query(
          `UPDATE web_pages
           SET status = 'pending', error_message = NULL, updated_at = NOW()
           WHERE status = 'failed'
             AND crawl_attempts < 3
           RETURNING id`
        )
        retriedCount = crawlResult.rowCount || 0
        break

      case 'quality-analysis':
        // Relancer les analyses échouées
        const qaResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'pending',
               retry_count = COALESCE(retry_count, 0) + 1,
               updated_at = NOW()
           WHERE status = 'failed'
             AND job_type = 'kb_quality_analysis'
             AND COALESCE(retry_count, 0) < 3
           RETURNING id`
        )
        retriedCount = qaResult.rowCount || 0
        break

      default:
        return NextResponse.json(
          { success: false, error: 'batchType invalide' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      batchType,
      action: 'retry',
      retriedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Batch Retry API] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
