import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { aiConfig } from '@/lib/ai/config'
import {
  getEmbeddingStats,
  fetchChunksToIndex,
  processConcurrentBatch,
  updateChunkEmbedding,
} from '@/lib/ai/embedding-batch-service'

/**
 * POST /api/admin/reindex-kb-ollama
 *
 * Génère et stocke les embeddings Ollama nomic-embed-text (768-dim)
 * sur les chunks existants qui n'en ont pas encore (colonne `embedding`).
 *
 * Query params:
 * - batch_size: Nombre de chunks à traiter par appel (défaut: 50, max: 200)
 * - concurrency: Nombre de requêtes parallèles (défaut: 2, max: 4)
 * - category: Catégorie spécifique (optionnel)
 *
 * Headers requis:
 * - Authorization: Bearer ${CRON_SECRET}
 *
 * Note: Ollama est lent (~0.5-1s/embedding). concurrency=2 recommandé.
 * Temps estimé complet: ~25 000 chunks / 2 concurrency / 1s = ~3.5h
 */
export const POST = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    if (!aiConfig.ollama.enabled) {
      return NextResponse.json(
        { error: 'OLLAMA_ENABLED=false — Ollama embeddings indisponibles' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(req.url)
    const batchSize = Math.min(parseInt(searchParams.get('batch_size') || '50'), 200)
    const concurrency = Math.min(parseInt(searchParams.get('concurrency') || '2'), 4)
    const category = searchParams.get('category')

    console.log('[ReindexOllama] Démarrage réindexation', { batchSize, concurrency, category })

    // Récupérer les chunks sans embedding Ollama
    const chunks = await fetchChunksToIndex({ nullColumn: 'embedding', batchSize, category })

    if (chunks.length === 0) {
      const statsResult = await db.query(
        `SELECT COUNT(*) as total, COUNT(embedding) FILTER (WHERE embedding IS NOT NULL) as ollama_indexed FROM knowledge_base_chunks`
      )
      const s = statsResult.rows[0]
      return NextResponse.json({
        success: true,
        message: 'Tous les chunks ont déjà un embedding Ollama',
        progress: {
          total: parseInt(s.total),
          ollama_indexed: parseInt(s.ollama_indexed),
          remaining: 0,
          percentage: 100,
        },
      })
    }

    console.log(`[ReindexOllama] ${chunks.length} chunks à traiter (concurrency=${concurrency})`)

    const batchResult = await processConcurrentBatch(
      chunks,
      async (chunk) => {
        const embResult = await generateEmbedding(chunk.content, { forceOllama: true })
        if (embResult.provider !== 'ollama' || embResult.embedding.length !== 768) {
          throw new Error(`Embedding invalide: provider=${embResult.provider}, dims=${embResult.embedding.length} (attendu: ollama/768)`)
        }
        await updateChunkEmbedding(chunk.id, 'embedding', embResult.embedding, 768)
      },
      concurrency,
      '[ReindexOllama]'
    )

    const stats = await getEmbeddingStats()
    const remaining = stats.total - stats.ollama.indexed

    console.log(`[ReindexOllama] Batch terminé: ${batchResult.indexed} indexés, ${batchResult.errors} erreurs`)

    return NextResponse.json({
      success: true,
      batch: batchResult,
      progress: {
        total: stats.total,
        ollama_indexed: stats.ollama.indexed,
        remaining,
        percentage: stats.ollama.pct,
      },
      next: remaining > 0
        ? { message: `Relancer pour continuer (${remaining} chunks restants)`, endpoint: req.url }
        : null,
    })
  } catch (error) {
    console.error('[ReindexOllama] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

/**
 * GET /api/admin/reindex-kb-ollama
 * Statut de la réindexation Ollama
 */
export const GET = withAdminApiAuth(async (_req, _ctx, _session) => {
  try {
    const stats = await getEmbeddingStats()
    const remaining = stats.total - stats.ollama.indexed
    const chunksPerSecond = 2
    const estimatedMinutes = Math.round(remaining / chunksPerSecond / 60)

    return NextResponse.json({
      total: stats.total,
      embeddings: {
        ollama:  { indexed: stats.ollama.indexed,  remaining, pct: stats.ollama.pct },
        openai:  { indexed: stats.openai.indexed,  pct: stats.openai.pct },
        gemini:  { indexed: stats.gemini.indexed,  pct: stats.gemini.pct },
      },
      ollamaAvailable: aiConfig.ollama.enabled,
      estimatedTime: remaining > 0 ? `~${estimatedMinutes} min (${remaining} chunks)` : 'Terminé',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
