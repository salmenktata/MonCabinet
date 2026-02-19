/**
 * API temporaire pour indexer les pages web crawlées
 * GET /api/admin/index-web-pages
 *
 * Indexe progressivement toutes les pages web crawlées non indexées
 * (indépendamment de leur source)
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexWebPages } from '@/lib/web-scraper/web-indexer-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export const GET = withAdminApiAuth(async (request: NextRequest, _ctx, _session): Promise<NextResponse> => {
  // Paramètre optionnel sourceId pour filtrer par source
  const sourceId = request.nextUrl.searchParams.get('sourceId') || undefined

  const startTime = Date.now()
  let totalIndexed = 0
  let totalFailed = 0
  const batchSize = 5 // OpenAI embeddings rapide en prod
  const maxBatches = 12 // Max 60 pages par appel (~4min pour grosses pages)

  console.log(`[IndexWebPages] Démarrage indexation web_pages (batch de ${batchSize}, max ${maxBatches} batches${sourceId ? `, source: ${sourceId}` : ''})`)

  try {
    for (let i = 0; i < maxBatches; i++) {
      const result = await indexWebPages(batchSize, sourceId)

      totalIndexed += result.succeeded
      totalFailed += result.failed

      console.log(
        `[IndexWebPages] Batch ${i + 1}: ${result.succeeded} indexées, ${result.failed} échouées`
      )

      // Si aucune page traitée, on a terminé
      if (result.processed === 0) {
        console.log('[IndexWebPages] Plus de pages à indexer')
        break
      }

      // Pause entre batches (éviter surcharge)
      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration,
      indexed: totalIndexed,
      failed: totalFailed,
    })
  } catch (error) {
    console.error('[IndexWebPages] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        indexed: totalIndexed,
        failed: totalFailed,
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
