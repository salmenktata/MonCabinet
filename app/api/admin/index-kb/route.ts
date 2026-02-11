/**
 * API pour indexer les documents knowledge_base
 * GET /api/admin/index-kb
 *
 * Supporte le mode turbo (EMBEDDING_TURBO_MODE=true) pour indexation rapide via OpenAI.
 * Paramètres configurables via env : KB_BATCH_SIZE, KB_BATCH_SIZE_TURBO
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexPendingDocuments } from '@/lib/ai/knowledge-base-service'
import { EMBEDDING_TURBO_CONFIG } from '@/lib/ai/config'

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

  const isTurbo = EMBEDDING_TURBO_CONFIG.enabled
  const batchSize = isTurbo
    ? EMBEDDING_TURBO_CONFIG.batchSize
    : parseInt(process.env.KB_BATCH_SIZE || '2', 10)
  const maxBatches = isTurbo ? 100 : 50
  const batchDelay = isTurbo ? 100 : 500

  const mode = isTurbo ? 'TURBO (OpenAI)' : 'normal (Ollama)'
  console.log(`[IndexKB] Démarrage indexation knowledge_base - mode ${mode}, batch de ${batchSize}`)

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

      // Pause entre chaque batch (réduite en mode turbo)
      await new Promise(resolve => setTimeout(resolve, batchDelay))
    }

    const duration = Date.now() - startTime
    const docsPerMinute = totalIndexed > 0 ? Math.round((totalIndexed / duration) * 60000) : 0

    return NextResponse.json({
      success: true,
      duration,
      indexed: totalIndexed,
      failed: totalFailed,
      docsPerMinute,
      mode: isTurbo ? 'turbo' : 'normal',
      batchSize,
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
