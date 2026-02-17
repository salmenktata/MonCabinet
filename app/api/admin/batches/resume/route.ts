/**
 * API Route : Resume Batch
 * POST /api/admin/batches/resume
 *
 * Reprend un batch pausé
 * S1.2 : Actions Batches
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
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

    let resumedCount = 0

    switch (batchType) {
      case 'kb-indexation':
        // Reprendre les jobs pausés
        const kbResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'pending', updated_at = NOW()
           WHERE status = 'paused' AND job_type = 'index_documents'
           RETURNING id`
        )
        resumedCount = kbResult.rowCount || 0
        break

      case 'web-crawls':
        // Reprendre les crawls pausés
        const crawlResult = await db.query(
          `UPDATE crawl_jobs
           SET status = 'pending', updated_at = NOW()
           WHERE status = 'paused'
           RETURNING id`
        )
        resumedCount = crawlResult.rowCount || 0
        break

      case 'quality-analysis':
        // Reprendre les analyses pausées
        const qaResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'pending', updated_at = NOW()
           WHERE status = 'paused' AND job_type = 'kb_quality_analysis'
           RETURNING id`
        )
        resumedCount = qaResult.rowCount || 0
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
      action: 'resume',
      resumedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Batch Resume API] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
