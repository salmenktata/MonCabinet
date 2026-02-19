import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import { aiConfig } from '@/lib/ai/config'

/**
 * POST /api/admin/reindex-kb-ollama
 *
 * Génère et stocke les embeddings Ollama qwen3-embedding:0.6b (1024-dim)
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
    let query = `
      SELECT
        kbc.id,
        kbc.content,
        kbc.chunk_index,
        kb.category,
        kb.title
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding IS NULL
        AND kb.is_active = true
    `
    const params: (string | number)[] = []
    let paramIndex = 1

    if (category) {
      query += ` AND kb.category = $${paramIndex++}`
      params.push(category)
    }

    query += ` ORDER BY kbc.id ASC LIMIT $${paramIndex++}`
    params.push(batchSize)

    const chunksResult = await db.query(query, params)
    const chunks = chunksResult.rows

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

    // Traitement par lots avec concurrence
    let indexed = 0
    let errors = 0
    const errorDetails: Array<{ id: string; error: string }> = []

    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency)

      const results = await Promise.allSettled(
        batch.map(async (chunk) => {
          const embResult = await generateEmbedding(chunk.content, { forceOllama: true })

          if (embResult.provider !== 'ollama' || embResult.embedding.length !== 1024) {
            throw new Error(
              `Embedding invalide: provider=${embResult.provider}, dims=${embResult.embedding.length} (attendu: ollama/1024)`
            )
          }

          const embStr = formatEmbeddingForPostgres(embResult.embedding)
          await db.query(
            `UPDATE knowledge_base_chunks SET embedding = $1::vector(1024) WHERE id = $2`,
            [embStr, chunk.id]
          )

          return chunk.id
        })
      )

      for (let j = 0; j < results.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled') {
          indexed++
        } else {
          errors++
          const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason)
          errorDetails.push({ id: batch[j].id, error: errMsg })
          console.error(`[ReindexOllama] Erreur chunk ${batch[j].id}:`, errMsg)
        }
      }

      if ((i + concurrency) % 20 === 0 || i + concurrency >= chunks.length) {
        console.log(`[ReindexOllama] Progression: ${Math.min(i + concurrency, chunks.length)}/${chunks.length}`)
      }
    }

    // Stats finales
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL) as ollama_indexed
      FROM knowledge_base_chunks
    `)
    const s = statsResult.rows[0]
    const total = parseInt(s.total)
    const ollamaIndexed = parseInt(s.ollama_indexed)
    const remaining = total - ollamaIndexed

    console.log(`[ReindexOllama] Batch terminé: ${indexed} indexés, ${errors} erreurs`)

    return NextResponse.json({
      success: true,
      batch: {
        processed: chunks.length,
        indexed,
        errors,
        errorDetails: errorDetails.slice(0, 5),
      },
      progress: {
        total,
        ollama_indexed: ollamaIndexed,
        remaining,
        percentage: Math.round((ollamaIndexed / total) * 100),
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
export const GET = withAdminApiAuth(async (req, _ctx, _session) => {
  try {
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL) as ollama_indexed,
        COUNT(embedding_openai) FILTER (WHERE embedding_openai IS NOT NULL) as openai_indexed,
        COUNT(embedding_gemini) FILTER (WHERE embedding_gemini IS NOT NULL) as gemini_indexed
      FROM knowledge_base_chunks
    `)

    const s = statsResult.rows[0]
    const total = parseInt(s.total)
    const ollamaIndexed = parseInt(s.ollama_indexed)
    const remaining = total - ollamaIndexed

    // Estimation temps restant (2 chunks/seconde avec concurrency=2)
    const chunksPerSecond = 2
    const estimatedSeconds = Math.round(remaining / chunksPerSecond)
    const estimatedMinutes = Math.round(estimatedSeconds / 60)

    return NextResponse.json({
      total,
      embeddings: {
        ollama: { indexed: ollamaIndexed, remaining, pct: Math.round(ollamaIndexed / total * 100) },
        openai: { indexed: parseInt(s.openai_indexed), pct: Math.round(parseInt(s.openai_indexed) / total * 100) },
        gemini: { indexed: parseInt(s.gemini_indexed), pct: Math.round(parseInt(s.gemini_indexed) / total * 100) },
      },
      ollamaAvailable: aiConfig.ollama.enabled,
      estimatedTime: remaining > 0
        ? `~${estimatedMinutes} min (${remaining} chunks × ${1 / chunksPerSecond}s/chunk)`
        : 'Terminé',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
