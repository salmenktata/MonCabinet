/**
 * API temporaire pour indexer les pages web crawlées
 * GET /api/admin/index-web-pages
 *
 * Indexe progressivement toutes les pages web crawlées non indexées
 * (indépendamment de leur source)
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexWebPages } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Vérifier l'authentification via CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const startTime = Date.now()
  let totalIndexed = 0
  let totalFailed = 0
  const batchSize = 2 // Réduit à 2 pour Ollama lent
  const maxBatches = 50 // Max 100 pages par appel

  console.log('[IndexWebPages] Démarrage indexation web_pages (batch de 2)')

  try {
    for (let i = 0; i < maxBatches; i++) {
      const result = await indexWebPages(batchSize)

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

      // Pause de 500ms entre chaque batch
      await new Promise((resolve) => setTimeout(resolve, 500))
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
}
