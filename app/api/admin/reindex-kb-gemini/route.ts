import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import { aiConfig } from '@/lib/ai/config'

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
    let query = `
      SELECT
        kbc.id,
        kbc.content,
        kbc.chunk_index,
        kb.category,
        kb.title
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding_gemini IS NULL
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
        `SELECT COUNT(*) as total, COUNT(embedding_gemini) as gemini_indexed FROM knowledge_base_chunks`
      )
      const s = statsResult.rows[0]
      return NextResponse.json({
        success: true,
        message: 'Tous les chunks ont déjà un embedding Gemini',
        progress: {
          total: parseInt(s.total),
          gemini_indexed: parseInt(s.gemini_indexed),
          remaining: 0,
          percentage: 100,
        },
      })
    }

    console.log(`[ReindexGemini] ${chunks.length} chunks à traiter (concurrency=${concurrency})`)

    // Traitement par lots avec concurrence
    let indexed = 0
    let errors = 0
    const errorDetails: Array<{ id: string; error: string }> = []

    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency)

      const results = await Promise.allSettled(
        batch.map(async (chunk) => {
          const embResult = await generateEmbedding(chunk.content, { forceGemini: true })

          if (embResult.provider !== 'gemini' || embResult.embedding.length !== 768) {
            throw new Error(
              `Embedding invalide: provider=${embResult.provider}, dims=${embResult.embedding.length} (attendu: gemini/768)`
            )
          }

          const embStr = formatEmbeddingForPostgres(embResult.embedding)
          await db.query(
            `UPDATE knowledge_base_chunks SET embedding_gemini = $1::vector(768) WHERE id = $2`,
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
          console.error(`[ReindexGemini] Erreur chunk ${batch[j].id}:`, errMsg)
        }
      }

      if ((i + concurrency) % 50 === 0 || i + concurrency >= chunks.length) {
        console.log(`[ReindexGemini] Progression: ${Math.min(i + concurrency, chunks.length)}/${chunks.length}`)
      }
    }

    // Stats finales
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding_gemini) FILTER (WHERE embedding_gemini IS NOT NULL) as gemini_indexed
      FROM knowledge_base_chunks
    `)
    const s = statsResult.rows[0]
    const total = parseInt(s.total)
    const geminiIndexed = parseInt(s.gemini_indexed)
    const remaining = total - geminiIndexed

    console.log(`[ReindexGemini] Batch terminé: ${indexed} indexés, ${errors} erreurs`)

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
        gemini_indexed: geminiIndexed,
        remaining,
        percentage: Math.round((geminiIndexed / total) * 100),
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
    const geminiIndexed = parseInt(s.gemini_indexed)
    const remaining = total - geminiIndexed

    // Estimation temps restant (5 chunks/seconde avec concurrency=5)
    const chunksPerSecond = 5
    const estimatedSeconds = Math.round(remaining / chunksPerSecond)
    const estimatedMinutes = Math.round(estimatedSeconds / 60)

    return NextResponse.json({
      total,
      embeddings: {
        ollama: { indexed: parseInt(s.ollama_indexed), pct: Math.round(parseInt(s.ollama_indexed) / total * 100) },
        openai: { indexed: parseInt(s.openai_indexed), pct: Math.round(parseInt(s.openai_indexed) / total * 100) },
        gemini: { indexed: geminiIndexed, remaining, pct: Math.round(geminiIndexed / total * 100) },
      },
      geminiAvailable: !!aiConfig.gemini.apiKey,
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
