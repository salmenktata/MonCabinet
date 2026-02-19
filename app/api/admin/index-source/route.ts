/**
 * API pour indexer les pages d'une source web spécifique
 * POST /api/admin/index-source
 *
 * Body: { sourceId: string, batchSize?: number, reindex?: boolean }
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export const POST = withAdminApiAuth(async (request: NextRequest, _ctx, _session): Promise<NextResponse> => {
  try {
    const body = await request.json()
    const { sourceId, batchSize = 50, reindex = false } = body

    if (!sourceId) {
      return NextResponse.json(
        { error: 'sourceId requis' },
        { status: 400 }
      )
    }

    console.log(`[IndexSource] Démarrage indexation source ${sourceId} (batch: ${batchSize}, reindex: ${reindex})`)

    const startTime = Date.now()
    const result = await indexSourcePages(sourceId, {
      limit: batchSize,
      reindex,
    })

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      details: result.results,
    })
  } catch (error) {
    console.error('[IndexSource] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
