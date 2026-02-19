import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import OpenAI from 'openai'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

/**
 * POST /api/admin/generate-embeddings
 * Génère les embeddings OpenAI pour les chunks qui n'en ont pas
 *
 * Auth: session super_admin OU CRON_SECRET
 *
 * Body (optionnel):
 * {
 *   "batchSize": 50,
 *   "category": "codes",
 *   "maxChunks": 1000
 * }
 */
export const POST = withAdminApiAuth(async (request: NextRequest, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = body.batchSize || 50
    const category = body.category || null
    const maxChunks = body.maxChunks || 0 // 0 = illimité

    console.log('Démarrage génération embeddings OpenAI')
    console.log(`   Batch size: ${batchSize}`)
    console.log(`   Catégorie: ${category || 'toutes'}`)
    console.log(`   Max chunks: ${maxChunks || 'illimité'}`)

    // Récupérer les chunks sans embeddings
    let queryText = `
      SELECT
        kbc.id,
        kbc.content,
        kb.category
      FROM knowledge_base_chunks kbc
      INNER JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_active = true
      AND kb.is_indexed = true
      AND kbc.embedding_openai IS NULL
    `

    const params: any[] = []

    if (category) {
      params.push(category)
      queryText += ` AND kb.category = $${params.length}`
    }

    if (maxChunks > 0) {
      params.push(maxChunks)
      queryText += ` LIMIT $${params.length}`
    }

    const chunks = await db.query(queryText, params)

    if (chunks.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun chunk sans embedding trouvé',
        processed: 0,
        failed: 0,
      })
    }

    console.log(`${chunks.rows.length} chunks à traiter`)

    // Traiter par batch
    let processed = 0
    let failed = 0
    const startTime = Date.now()

    for (let i = 0; i < chunks.rows.length; i += batchSize) {
      const batch = chunks.rows.slice(i, Math.min(i + batchSize, chunks.rows.length))

      for (const chunk of batch) {
        try {
          // Générer embedding
          const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunk.content as string,
            encoding_format: 'float',
          })

          const embedding = response.data[0].embedding

          // Mettre à jour en DB
          await db.query(
            `UPDATE knowledge_base_chunks
             SET embedding_openai = $1::vector(1536)
             WHERE id = $2`,
            [JSON.stringify(embedding), chunk.id]
          )

          processed++

          // Log progression tous les 50
          if (processed % 50 === 0) {
            const elapsed = (Date.now() - startTime) / 1000
            const rate = Math.round(processed / elapsed)
            console.log(`   ${processed}/${chunks.rows.length} (${rate} chunks/s)`)
          }

          // Délai pour rate limiting
          await new Promise(resolve => setTimeout(resolve, 20))

        } catch (error) {
          console.error(`   Échec chunk ${chunk.id}:`, error)
          failed++
        }
      }
    }

    const totalTime = (Date.now() - startTime) / 1000

    return NextResponse.json({
      success: true,
      processed,
      failed,
      total: chunks.rows.length,
      duration: `${totalTime.toFixed(1)}s`,
      rate: `${Math.round(processed / totalTime)} chunks/s`,
    })

  } catch (error) {
    console.error('Erreur génération embeddings:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
