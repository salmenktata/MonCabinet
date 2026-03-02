/**
 * API Route: Backfill embeddings Ollama manquants
 * GET /api/admin/backfill-ollama
 *
 * Détecte les chunks indexés sans embedding Ollama (embedding IS NULL)
 * et génère les vecteurs 768-dim manquants via nomic-embed-text.
 *
 * Cas d'usage : documents indexés avant activation Ollama, ou quand Ollama
 * était down pendant l'indexation initiale.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 20          // chunks par batch Ollama
const DEFAULT_MAX_BATCHES = 100 // 2000 chunks par défaut (20 × 100)
const MAX_BATCHES_LIMIT = 250   // plafond de sécurité (250 × 20 = 5000 chunks max, ~4min)
const BATCH_DELAY_MS = 150      // délai réduit : Ollama tourne en local sur le VPS

export const GET = withAdminApiAuth(async (request: NextRequest): Promise<NextResponse> => {
  const startTime = Date.now()
  let totalBackfilled = 0
  let totalFailed = 0

  // Paramètre optionnel ?batches=N pour contrôler le volume par appel (défaut: 100 = 2000 chunks)
  const batchesParam = parseInt(request.nextUrl.searchParams.get('batches') || String(DEFAULT_MAX_BATCHES), 10)
  const maxBatches = Math.min(Math.max(1, batchesParam), MAX_BATCHES_LIMIT)

  const { generateEmbeddingsBatch, formatEmbeddingForPostgres } = await import('@/lib/ai/embeddings-service')

  console.log(`[BackfillOllama] Démarrage backfill: ${maxBatches} batches × ${BATCH_SIZE} = ${maxBatches * BATCH_SIZE} chunks max`)

  try {
    for (let batch = 0; batch < maxBatches; batch++) {
      // Trouver des chunks sans embedding Ollama dans des docs indexés + rag_enabled
      const chunksResult = await db.query(
        `SELECT kbc.id, kbc.content
         FROM knowledge_base_chunks kbc
         JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
         WHERE kbc.embedding IS NULL
           AND kb.is_indexed = true
           AND kb.rag_enabled = true
         ORDER BY kb.created_at DESC
         LIMIT $1`,
        [BATCH_SIZE]
      )

      if (chunksResult.rows.length === 0) {
        console.log('[BackfillOllama] Plus de chunks à backfiller')
        break
      }

      const chunks = chunksResult.rows as { id: string; content: string }[]

      // Générer les embeddings Ollama
      let embeddings: number[][] = []
      try {
        const result = await generateEmbeddingsBatch(
          chunks.map(c => c.content),
          { forceOllama: true }
        )
        embeddings = result.embeddings
      } catch (err) {
        console.error(`[BackfillOllama] Erreur génération batch ${batch + 1}:`, err)
        totalFailed += chunks.length
        break // Ollama indisponible, arrêter
      }

      // Mise à jour en batch
      const ids: string[] = []
      const vectors: string[] = []
      for (let i = 0; i < chunks.length; i++) {
        if (embeddings[i] && embeddings[i].length === 768) {
          ids.push(chunks[i].id)
          vectors.push(formatEmbeddingForPostgres(embeddings[i]))
        }
      }

      if (ids.length > 0) {
        await db.query(
          `UPDATE knowledge_base_chunks kbc
           SET embedding = batch.vec::vector(768)
           FROM unnest($1::uuid[], $2::text[]) AS batch(chunk_id, vec)
           WHERE kbc.id = batch.chunk_id`,
          [ids, vectors]
        )
        totalBackfilled += ids.length
      }

      const failed = chunks.length - ids.length
      totalFailed += failed

      console.log(`[BackfillOllama] Batch ${batch + 1}: ${ids.length} backfillés, ${failed} ignorés`)

      if (chunks.length < BATCH_SIZE) break

      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS))
    }

    const duration = Date.now() - startTime

    // Compter les chunks encore sans embedding Ollama
    const remainingResult = await db.query(
      `SELECT COUNT(*) as count
       FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
       WHERE kbc.embedding IS NULL
         AND kb.is_indexed = true
         AND kb.rag_enabled = true`
    )
    const remaining = parseInt(remainingResult.rows[0].count)

    console.log(`[BackfillOllama] Terminé: ${totalBackfilled} backfillés, ${remaining} restants`)

    return NextResponse.json({
      success: true,
      backfilled: totalBackfilled,
      failed: totalFailed,
      remaining,
      duration,
      batchesRun: Math.ceil(totalBackfilled / BATCH_SIZE),
      chunksPerCall: maxBatches * BATCH_SIZE,
    })
  } catch (error) {
    console.error('[BackfillOllama] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        backfilled: totalBackfilled,
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
