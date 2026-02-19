/**
 * API Route TEMPORAIRE: Indexer Google Drive pages
 * Protégé par CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 600 // 10 minutes

const GDRIVE_SOURCE_ID = '546d11c8-b3fd-4559-977b-c3572aede0e4'

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const limit = body.limit || 200

    console.log(`[IndexGDrive] Démarrage indexation de ${limit} pages max...`)

    const result = await indexSourcePages(GDRIVE_SOURCE_ID, {
      limit,
      reindex: false,
    })

    console.log(
      `[IndexGDrive] Terminé: ${result.succeeded}/${result.processed} réussies`
    )

    return NextResponse.json({
      success: true,
      message: `Indexation terminée: ${result.succeeded}/${result.processed} réussies`,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    })
  } catch (error) {
    console.error('[IndexGDrive] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur indexation',
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
