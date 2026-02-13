import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { generateEmbedding } from '@/lib/ai/embeddings-service'

/**
 * POST /api/admin/reindex-kb-openai
 *
 * Réindexe la Knowledge Base avec OpenAI embeddings (text-embedding-3-small)
 *
 * Query params:
 * - batch_size: Nombre de chunks à traiter par appel (défaut: 50)
 * - category: Catégorie spécifique à réindexer (optionnel)
 * - skip_indexed: Ignorer les chunks déjà indexés (défaut: true)
 *
 * Headers requis:
 * - Authorization: Bearer ${CRON_SECRET}
 */
export async function POST(req: NextRequest) {
  try {
    // Vérifier l'authentification
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parser les query params
    const { searchParams } = new URL(req.url)
    const batchSize = parseInt(searchParams.get('batch_size') || '50')
    const category = searchParams.get('category')
    const skipIndexed = searchParams.get('skip_indexed') !== 'false'

    console.log('[ReindexOpenAI] Démarrage réindexation', {
      batchSize,
      category,
      skipIndexed,
    })

    // Récupérer les chunks à indexer
    let query = `
      SELECT
        kbc.id,
        kbc.content_chunk,
        kbc.chunk_index,
        kb.id as kb_id,
        kb.title
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE 1=1
    `
    const params: (string | number)[] = []
    let paramIndex = 1

    if (skipIndexed) {
      query += ` AND kbc.embedding_openai IS NULL`
    }

    if (category) {
      query += ` AND kb.category = $${paramIndex++}`
      params.push(category)
    }

    query += ` ORDER BY kbc.id ASC LIMIT $${paramIndex++}`
    params.push(batchSize)

    const chunksResult = await db.query(query, params)
    const chunks = chunksResult.rows

    if (chunks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun chunk à indexer',
        indexed: 0,
        total: 0,
      })
    }

    console.log(`[ReindexOpenAI] ${chunks.length} chunks à indexer`)

    // Indexer chaque chunk avec OpenAI
    let indexed = 0
    let errors = 0
    const errorDetails: Array<{ id: string; error: string }> = []

    for (const chunk of chunks) {
      try {
        // Générer l'embedding OpenAI
        const embeddingResult = await generateEmbedding(chunk.content_chunk, {
          operationName: 'dossiers-assistant', // Utilise OpenAI embeddings
        })

        // Vérifier que c'est bien un embedding OpenAI (1536 dimensions)
        const embedding = embeddingResult?.embedding
        if (!embedding || !Array.isArray(embedding) || embedding.length !== 1536) {
          throw new Error(`Embedding invalide: ${embedding?.length || 0} dimensions (attendu: 1536)`)
        }

        // Mettre à jour le chunk avec l'embedding OpenAI
        await db.query(
          `UPDATE knowledge_base_chunks
           SET embedding_openai = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(embedding), chunk.id]
        )

        indexed++

        // Log progression tous les 10 chunks
        if (indexed % 10 === 0) {
          console.log(`[ReindexOpenAI] Progression: ${indexed}/${chunks.length}`)
        }
      } catch (error) {
        errors++
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        errorDetails.push({
          id: chunk.id,
          error: errorMsg,
        })
        console.error(`[ReindexOpenAI] Erreur chunk ${chunk.id}:`, errorMsg)

        // Continuer malgré les erreurs
        continue
      }
    }

    // Compter le total restant
    const remainingResult = await db.query(`
      SELECT COUNT(*) as remaining
      FROM knowledge_base_chunks
      WHERE embedding_openai IS NULL
    `)
    const remaining = parseInt(remainingResult.rows[0].remaining, 10)

    // Calculer le pourcentage total
    const totalChunks = await db.query(`SELECT COUNT(*) as total FROM knowledge_base_chunks`)
    const total = parseInt(totalChunks.rows[0].total, 10)
    const totalIndexed = total - remaining
    const progress = Math.round((totalIndexed / total) * 100)

    console.log(`[ReindexOpenAI] Batch terminé: ${indexed} indexés, ${errors} erreurs`)

    return NextResponse.json({
      success: true,
      batch: {
        indexed,
        errors,
        errorDetails: errorDetails.slice(0, 5), // Limiter à 5 erreurs max
      },
      progress: {
        totalChunks: total,
        indexed: totalIndexed,
        remaining,
        percentage: progress,
      },
      next: remaining > 0 ? {
        message: 'Relancer pour continuer la réindexation',
        endpoint: req.url,
      } : null,
    })
  } catch (error) {
    console.error('[ReindexOpenAI] Erreur fatale:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/reindex-kb-openai
 *
 * Retourne le statut de la réindexation
 */
export async function GET(req: NextRequest) {
  try {
    // Vérifier l'authentification
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Récupérer les statistiques
    const statsResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(embedding) FILTER (WHERE embedding IS NOT NULL) as ollama_indexed,
        COUNT(embedding_openai) FILTER (WHERE embedding_openai IS NOT NULL) as openai_indexed,
        COUNT(content_tsvector) FILTER (WHERE content_tsvector IS NOT NULL) as tsvector_indexed
      FROM knowledge_base_chunks
    `)

    const stats = statsResult.rows[0]
    const total = parseInt(stats.total, 10)
    const ollamaIndexed = parseInt(stats.ollama_indexed, 10)
    const openaiIndexed = parseInt(stats.openai_indexed, 10)
    const tsvectorIndexed = parseInt(stats.tsvector_indexed, 10)

    const openaiProgress = Math.round((openaiIndexed / total) * 100)
    const remaining = total - openaiIndexed

    return NextResponse.json({
      total,
      embeddings: {
        ollama: {
          indexed: ollamaIndexed,
          percentage: Math.round((ollamaIndexed / total) * 100),
        },
        openai: {
          indexed: openaiIndexed,
          remaining,
          percentage: openaiProgress,
        },
      },
      tsvector: {
        indexed: tsvectorIndexed,
        percentage: Math.round((tsvectorIndexed / total) * 100),
      },
      estimatedCost: {
        perBatch: '$0.001',
        remaining: `$${(remaining * 0.00002).toFixed(4)}`,
        total: `$${(total * 0.00002).toFixed(4)}`,
      },
    })
  } catch (error) {
    console.error('[ReindexOpenAI] Erreur récupération stats:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
