/**
 * API pour indexer les documents knowledge_base
 * GET /api/admin/index-kb
 *
 * Supporte le mode turbo (EMBEDDING_TURBO_MODE=true) pour indexation rapide via OpenAI.
 * Paramètres configurables via env : KB_BATCH_SIZE, KB_BATCH_SIZE_TURBO
 */

import { NextRequest, NextResponse } from 'next/server'
import { indexPendingDocuments, backfillOllamaEmbeddings } from '@/lib/ai/knowledge-base-service'
import { EMBEDDING_TURBO_CONFIG } from '@/lib/ai/config'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { adaptiveSleep, waitForSafeLoad } from '@/lib/system/load-guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

export const GET = withAdminApiAuth(async (_request: NextRequest, _ctx, _session): Promise<NextResponse> => {
  const startTime = Date.now()
  let totalIndexed = 0
  let totalFailed = 0

  const isTurbo = EMBEDDING_TURBO_CONFIG.enabled
  const batchSize = isTurbo
    ? EMBEDDING_TURBO_CONFIG.batchSize
    : parseInt(process.env.KB_BATCH_SIZE || '5', 10)
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

      // Pause adaptative entre batches — réduit automatiquement si le serveur est chargé
      const loadLevel = await adaptiveSleep(batchDelay)
      if (loadLevel === 'overloaded') {
        const safe = await waitForSafeLoad(30_000)
        if (!safe) {
          console.warn('[IndexKB] Serveur surchargé depuis >30s — arrêt anticipé pour préserver la navigation')
          break
        }
      }
    }

    const duration = Date.now() - startTime
    const docsPerMinute = totalIndexed > 0 ? Math.round((totalIndexed / duration) * 60000) : 0

    // Backfill embeddings Ollama manquants sur chunks déjà indexés (mode normal uniquement)
    let backfillResult = null
    if (!isTurbo) {
      try {
        backfillResult = await backfillOllamaEmbeddings()
        if (backfillResult.backfilled > 0) {
          console.log(`[IndexKB] Backfill Ollama: ${backfillResult.backfilled} chunks mis à jour, ${backfillResult.remaining} restants`)
        }
      } catch (err) {
        console.warn('[IndexKB] Backfill Ollama ignoré (Ollama indisponible?):', err)
      }
    }

    return NextResponse.json({
      success: true,
      duration,
      indexed: totalIndexed,
      failed: totalFailed,
      docsPerMinute,
      mode: isTurbo ? 'turbo' : 'normal',
      batchSize,
      ...(backfillResult && { backfill: backfillResult }),
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
}, { allowCronSecret: true })
