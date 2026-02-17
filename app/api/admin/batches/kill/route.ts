import { getErrorMessage } from '@/lib/utils/error-utils'
/**
 * API Route : Kill Batch
 * POST /api/admin/batches/kill
 *
 * Arrête brutalement un batch en cours (cancelled status)
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

    let killedCount = 0

    switch (batchType) {
      case 'kb-indexation':
        // Arrêter les jobs en cours
        const kbResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'cancelled',
               error_message = 'Annulé manuellement par admin',
               updated_at = NOW()
           WHERE status IN ('running', 'pending')
             AND job_type = 'index_documents'
           RETURNING id`
        )
        killedCount = kbResult.rowCount || 0
        break

      case 'web-crawls':
        // Arrêter les crawl jobs actifs
        const crawlResult = await db.query(
          `UPDATE crawl_jobs
           SET status = 'cancelled',
               error_message = 'Annulé manuellement par admin',
               updated_at = NOW()
           WHERE status IN ('running', 'pending')
           RETURNING id`
        )
        killedCount = crawlResult.rowCount || 0
        break

      case 'quality-analysis':
        // Arrêter les analyses en cours
        const qaResult = await db.query(
          `UPDATE indexing_jobs
           SET status = 'cancelled',
               error_message = 'Annulé manuellement par admin',
               updated_at = NOW()
           WHERE status IN ('running', 'pending')
             AND job_type = 'kb_quality_analysis'
           RETURNING id`
        )
        killedCount = qaResult.rowCount || 0
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
      action: 'kill',
      killedCount,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Batch Kill API] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
