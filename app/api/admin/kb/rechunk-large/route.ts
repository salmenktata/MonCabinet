/**
 * POST /api/admin/kb/rechunk-large
 *
 * Re-chunke un batch de documents dont certains chunks dépassent 2000 chars.
 * Supprime les anciens chunks, rechunke avec la config actuelle, régénère les embeddings.
 *
 * Body:
 *   batchSize      (default: 5)    — nombre de docs à traiter
 *   maxChunkChars  (default: 2000) — seuil de détection "trop grand"
 *
 * Réponse:
 *   processed, succeeded, failed, remaining
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { chunkText } from '@/lib/ai/chunking-service'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '5', 10), 20)
    const maxChunkChars = parseInt(body.maxChunkChars || '2000', 10)


    console.log('[RechunkLarge] Démarrage:', { batchSize, maxChunkChars })

    // Trouver les documents avec des chunks trop grands
    const docsResult = await db.query<{
      doc_id: string
      title: string
      category: string
      large_chunks: number
      max_chars: number
    }>(`
      SELECT
        kb.id as doc_id,
        kb.title,
        kb.category,
        COUNT(*) FILTER (WHERE LENGTH(kbc.content) > $1) as large_chunks,
        MAX(LENGTH(kbc.content)) as max_chars
      FROM knowledge_base kb
      JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active = true
      GROUP BY kb.id, kb.title, kb.category
      HAVING COUNT(*) FILTER (WHERE LENGTH(kbc.content) > $1) > 0
      ORDER BY large_chunks DESC, max_chars DESC
      LIMIT $2
    `, [maxChunkChars, batchSize])

    const docs = docsResult.rows

    // Compter le total restant (pour le monitoring)
    const remainingResult = await db.query<{ count: string }>(`
      SELECT COUNT(DISTINCT kb.id) as count
      FROM knowledge_base kb
      JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active = true
        AND LENGTH(kbc.content) > $1
    `, [maxChunkChars])
    const remaining = parseInt(remainingResult.rows[0]?.count || '0', 10)

    if (docs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document avec chunks trop grands',
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        duration: Date.now() - startTime,
      })
    }

    console.log(`[RechunkLarge] ${docs.length} docs à traiter, ${remaining} total restants`)

    let succeeded = 0
    let failed = 0
    const results: Array<{ docId: string; title: string; success: boolean; newChunks?: number; error?: string }> = []

    for (const doc of docs) {
      try {
        // 1. Récupérer le full_text
        const textResult = await db.query<{ full_text: string }>(
          `SELECT full_text FROM knowledge_base WHERE id = $1`,
          [doc.doc_id]
        )

        if (!textResult.rows[0]?.full_text) {
          throw new Error('full_text manquant')
        }

        const fullText = textResult.rows[0].full_text

        // 2. Supprimer les anciens chunks
        await db.query(
          `DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = $1`,
          [doc.doc_id]
        )

        // 3. Re-chunker
        const newChunks = chunkText(fullText, {
          category: doc.category.toLowerCase(),
          preserveParagraphs: true,
          preserveSentences: true,
        })

        // 4. Générer embeddings et insérer
        let insertedCount = 0
        for (const [index, chunk] of newChunks.entries()) {
          // Générer les 2 embeddings principaux en parallèle
          const [ollamaResult, openaiResult] = await Promise.all([
            generateEmbedding(chunk.content, { forceOllama: true }),
            generateEmbedding(chunk.content),
          ])
          await db.query(`
            INSERT INTO knowledge_base_chunks (
              knowledge_base_id, chunk_index, content, embedding, embedding_openai
            ) VALUES ($1, $2, $3, $4, $5)
          `, [
            doc.doc_id,
            index,
            chunk.content,
            formatEmbeddingForPostgres(ollamaResult.embedding),
            formatEmbeddingForPostgres(openaiResult.embedding),
          ])
          insertedCount++
        }

        // 5. Mettre à jour chunk_count
        await db.query(
          `UPDATE knowledge_base SET chunk_count = $1, updated_at = NOW() WHERE id = $2`,
          [insertedCount, doc.doc_id]
        )

        succeeded++
        results.push({ docId: doc.doc_id, title: doc.title, success: true, newChunks: insertedCount })
        console.log(`[RechunkLarge] ✅ "${doc.title}" → ${insertedCount} chunks`)
      } catch (err) {
        failed++
        const msg = getErrorMessage(err)
        results.push({ docId: doc.doc_id, title: doc.title, success: false, error: msg })
        console.error(`[RechunkLarge] ❌ "${doc.title}": ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Rechunk terminé: ${succeeded}/${docs.length} réussis`,
      processed: docs.length,
      succeeded,
      failed,
      remaining: Math.max(0, remaining - succeeded),
      duration: Date.now() - startTime,
      results,
    })
  } catch (error) {
    console.error('[RechunkLarge] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
