/**
 * API temporaire pour indexer les documents knowledge_base
 * GET /api/admin/index-kb
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexPendingDocuments } from '@/lib/ai/knowledge-base-service'

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
  const batchSize = 10
  const maxBatches = 50 // Max 500 documents par appel

  console.log('[IndexKB] Démarrage indexation knowledge_base')

  try {
    for (let i = 0; i < maxBatches; i++) {
      const result = await indexPendingDocuments(batchSize)

      totalIndexed += result.succeeded
      totalFailed += result.failed

      console.log(`[IndexKB] Batch ${i + 1}: ${result.succeeded} indexés, ${result.failed} échoués`)

      // Si aucun document traité, on a terminé
      if (result.processed === 0) {
        console.log('[IndexKB] Plus de documents à indexer')
        break
      }

      // Pause de 500ms entre chaque batch
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      duration,
      indexed: totalIndexed,
      failed: totalFailed,
    })
  } catch (error) {
    console.error('[IndexKB] Erreur:', error)
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
