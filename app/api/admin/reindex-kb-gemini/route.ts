import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { aiConfig } from '@/lib/ai/config'
import {
  getEmbeddingStats,
  fetchChunksToIndex,
  processConcurrentBatch,
  updateChunkEmbedding,
} from '@/lib/ai/embedding-batch-service'

/**
 * POST /api/admin/reindex-kb-gemini
 *
 * Génère et stocke les embeddings Gemini text-embedding-004 (768-dim)
 * sur les chunks existants qui n'en ont pas encore.
 *
 * Query params:
 * - batch_size: Nombre de chunks à traiter par appel (défaut: 100)
 * - concurrency: Nombre de requêtes parallèles (défaut: 5, max 10)
 * - category: Catégorie spécifique (optionnel)
 *
 * Headers requis:
 * - Authorization: Bearer ${CRON_SECRET}
 *
 * Taux Gemini free tier : 1500 req/min → concurrency=5 très safe.
 */
export const POST = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    if (!aiConfig.gemini.apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY non configurée — Gemini embeddings indisponibles' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(req.url)

    // Guard anti-re-déclenchement : opération one-time déjà terminée (25,249 chunks indexés)
    const force = searchParams.get('force') === 'true'
    if (!force) {
      return NextResponse.json({
        message: 'Gemini reindex already completed (25,249 chunks). Use ?force=true to re-run.',
        status: 'skipped',
      }, { status: 200 })
    }
    const batchSize = Math.min(parseInt(searchParams.get('batch_size') || '100'), 500)
    const concurrency = Math.min(parseInt(searchParams.get('concurrency') || '5'), 10)
    const category = searchParams.get('category')

    console.log('[ReindexGemini] Démarrage réindexation', { batchSize, concurrency, category })

    // Récupérer les chunks sans embedding_gemini
    const chunks = await fetchChunksToIndex({ nullColumn: 'embedding_gemini', batchSize, category })

    if (chunks.length === 0) {
      const stats = await getEmbeddingStats()
      return NextResponse.json({
        success: true,
        message: 'Tous les chunks ont déjà un embedding Gemini',
        progress: {
          total: stats.total,
          gemini_indexed: stats.gemini.indexed,
          remaining: 0,
          percentage: 100,
        },
      })
    }

    console.log(`[ReindexGemini] ${chunks.length} chunks à traiter (concurrency=${concurrency})`)

    const batchResult = await processConcurrentBatch(
      chunks,
      async (chunk) => {
        const embResult = await generateEmbedding(chunk.content, { forceGemini: true })
        if (embResult.provider !== 'gemini' || embResult.embedding.length !== 768) {
          throw new Error(
            `Embedding invalide: provider=${embResult.provider}, dims=${embResult.embedding.length} (attendu: gemini/768)`
          )
        }
        await updateChunkEmbedding(chunk.id, 'embedding_gemini', embResult.embedding, 768)
      },
      concurrency,
      '[ReindexGemini]'
    )

    const stats = await getEmbeddingStats()
    const remaining = stats.total - stats.gemini.indexed

    console.log(`[ReindexGemini] Batch terminé: ${batchResult.indexed} indexés, ${batchResult.errors} erreurs`)

    return NextResponse.json({
      success: true,
      batch: batchResult,
      progress: {
        total: stats.total,
        gemini_indexed: stats.gemini.indexed,
        remaining,
        percentage: stats.gemini.pct,
      },
      next: remaining > 0
        ? { message: `Relancer pour continuer (${remaining} chunks restants)`, endpoint: req.url }
        : null,
    })
  } catch (error) {
    console.error('[ReindexGemini] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

/**
 * GET /api/admin/reindex-kb-gemini
 * Statut de la réindexation Gemini
 */
export const GET = withAdminApiAuth(async (_req, _ctx, _session) => {
  try {
    const stats = await getEmbeddingStats()
    const remaining = stats.total - stats.gemini.indexed
    const chunksPerSecond = 5
    const estimatedMinutes = Math.round(remaining / chunksPerSecond / 60)

    return NextResponse.json({
      total: stats.total,
      embeddings: {
        ollama:  { indexed: stats.ollama.indexed,  pct: stats.ollama.pct },
        openai:  { indexed: stats.openai.indexed,  pct: stats.openai.pct },
        gemini:  { indexed: stats.gemini.indexed,  remaining, pct: stats.gemini.pct },
      },
      geminiAvailable: !!aiConfig.gemini.apiKey,
      estimatedTime: remaining > 0
        ? `~${estimatedMinutes} min (${remaining} chunks)`
        : 'Terminé',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
