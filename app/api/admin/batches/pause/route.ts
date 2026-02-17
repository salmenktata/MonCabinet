/**
 * API Route : Pause Batch
 * POST /api/admin/batches/pause
 *
 * Met en pause un batch spécifique (KB, Web Crawls, Quality Analysis)
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
    const { batchType } = body // 'kb-indexation' | 'web-crawls' | 'quality-analysis'

    if (!batchType) {
      return NextResponse.json(
        { success: false, error: 'batchType requis' },
        { status: 400 }
      )
    }

    // Logique de pause selon le type de batch
    let result: any = {}

    switch (batchType) {
      case 'kb-indexation':
        // Marquer les jobs pending en attente comme paused
        await db.query(
          `UPDATE indexing_jobs
           SET status = 'paused', updated_at = NOW()
           WHERE status = 'pending' AND job_type = 'index_documents'`
        )
        result = { affected: 'indexing_jobs' }
        break

      case 'web-crawls':
        // Marquer les crawl jobs actifs comme paused
        await db.query(
          `UPDATE crawl_jobs
           SET status = 'paused', updated_at = NOW()
           WHERE status IN ('pending', 'running')`
        )
        result = { affected: 'crawl_jobs' }
        break

      case 'quality-analysis':
        // Marquer les analyses en attente comme paused
        await db.query(
          `UPDATE indexing_jobs
           SET status = 'paused', updated_at = NOW()
           WHERE status = 'pending' AND job_type = 'kb_quality_analysis'`
        )
        result = { affected: 'kb_quality_analysis_jobs' }
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
      action: 'pause',
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (error) {
    console.error('[Batch Pause API] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
