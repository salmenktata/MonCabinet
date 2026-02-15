import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { approveDocument } from '@/lib/legal-documents/document-service'
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

interface DocumentResult {
  id: string
  citationKey: string
  title: string
  chunksCreated: number
  durationMs: number
  error?: string
}

/**
 * POST /api/admin/legal-documents/bulk-approve-index
 *
 * Approuve en masse les legal documents consolidés, les indexe dans la KB,
 * puis nettoie les anciennes entrées KB page-level redondantes.
 *
 * Query params:
 * - dry-run=true : Mode simulation, aucune modification
 *
 * Headers:
 * - X-Cron-Secret: Secret cron pour authentification
 */
export async function POST(request: NextRequest) {
  try {
    const cronSecret = request.headers.get('X-Cron-Secret')
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dryRun = request.nextUrl.searchParams.get('dry-run') === 'true'
    const startTime = Date.now()

    // 1. Récupérer les documents éligibles (consolidés mais pas approuvés)
    const docsResult = await db.query<{
      id: string
      citation_key: string
      title: string
      total_articles: number
    }>(
      `SELECT id, citation_key, title, total_articles
       FROM legal_documents
       WHERE consolidation_status = 'complete'
         AND is_approved = false
       ORDER BY citation_key`
    )

    const documents = docsResult.rows

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document à approuver',
        summary: { documentsFound: 0 }
      })
    }

    // 2. En dry-run, estimer le nettoyage KB et retourner
    if (dryRun) {
      const docIds = documents.map(d => d.id)

      // Compter les pages liées
      const pagesResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM web_pages_documents
         WHERE legal_document_id = ANY($1)`,
        [docIds]
      )

      // Compter les KB entries page-level existantes
      const kbResult = await db.query<{ kb_count: string, chunk_count: string }>(
        `SELECT
           COUNT(DISTINCT wp.knowledge_base_id) as kb_count,
           COALESCE(SUM(wp.chunks_count), 0) as chunk_count
         FROM web_pages wp
         JOIN web_pages_documents wpd ON wp.id = wpd.web_page_id
         WHERE wpd.legal_document_id = ANY($1)
           AND wp.knowledge_base_id IS NOT NULL`,
        [docIds]
      )

      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: {
          documentsToApprove: documents.length,
          totalArticles: documents.reduce((sum, d) => sum + (d.total_articles || 0), 0),
          linkedPages: parseInt(pagesResult.rows[0].count),
          oldKbEntriesToClean: parseInt(kbResult.rows[0].kb_count),
          oldChunksToClean: parseInt(kbResult.rows[0].chunk_count),
        },
        documents: documents.map(d => ({
          id: d.id,
          citationKey: d.citation_key,
          title: d.title,
          totalArticles: d.total_articles,
        }))
      })
    }

    // 3. Exécution réelle : approuver + indexer chaque document
    console.log(`[BulkApprove] Démarrage : ${documents.length} documents à traiter`)

    const results: DocumentResult[] = []
    let totalChunksCreated = 0
    let successCount = 0
    let errorCount = 0

    for (const doc of documents) {
      const docStart = Date.now()

      try {
        // Approuver
        await approveDocument(doc.id, 'system-bulk-approve')

        // Indexer (crée KB entry + chunks + embeddings)
        const indexResult = await indexLegalDocument(doc.id)

        const durationMs = Date.now() - docStart
        const chunksCreated = indexResult.chunksCreated || 0
        totalChunksCreated += chunksCreated
        successCount++

        results.push({
          id: doc.id,
          citationKey: doc.citation_key,
          title: doc.title,
          chunksCreated,
          durationMs,
          ...(indexResult.error ? { error: indexResult.error } : {}),
        })

        console.log(`[BulkApprove] ✅ ${doc.citation_key} : ${chunksCreated} chunks (${durationMs}ms)`)
      } catch (error) {
        const durationMs = Date.now() - docStart
        errorCount++
        const errorMsg = error instanceof Error ? error.message : String(error)

        results.push({
          id: doc.id,
          citationKey: doc.citation_key,
          title: doc.title,
          chunksCreated: 0,
          durationMs,
          error: errorMsg,
        })

        console.error(`[BulkApprove] ❌ ${doc.citation_key} : ${errorMsg}`)
      }
    }

    // 4. Nettoyage des anciennes KB entries page-level
    console.log('[BulkApprove] Nettoyage KB page-level...')

    const approvedDocIds = results
      .filter(r => !r.error)
      .map(r => r.id)

    let oldKbEntriesCleaned = 0
    let oldChunksCleaned = 0

    if (approvedDocIds.length > 0) {
      // Récupérer les knowledge_base_id des legal_documents (à exclure du cleanup)
      const legalKbResult = await db.query<{ knowledge_base_id: string }>(
        `SELECT knowledge_base_id FROM legal_documents
         WHERE id = ANY($1) AND knowledge_base_id IS NOT NULL`,
        [approvedDocIds]
      )
      const legalKbIds = legalKbResult.rows.map(r => r.knowledge_base_id)

      // Récupérer les anciennes KB entries des web_pages liées
      const oldKbResult = await db.query<{ kb_id: string }>(
        `SELECT DISTINCT wp.knowledge_base_id as kb_id
         FROM web_pages wp
         JOIN web_pages_documents wpd ON wp.id = wpd.web_page_id
         WHERE wpd.legal_document_id = ANY($1)
           AND wp.knowledge_base_id IS NOT NULL
           ${legalKbIds.length > 0 ? 'AND wp.knowledge_base_id != ALL($2)' : ''}`,
        legalKbIds.length > 0 ? [approvedDocIds, legalKbIds] : [approvedDocIds]
      )

      const oldKbIds = oldKbResult.rows.map(r => r.kb_id)
      oldKbEntriesCleaned = oldKbIds.length

      if (oldKbIds.length > 0) {
        const client = await db.getClient()
        try {
          await client.query('BEGIN')

          // Supprimer les chunks des anciennes entrées
          const chunksDeleted = await client.query(
            'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = ANY($1)',
            [oldKbIds]
          )
          oldChunksCleaned = chunksDeleted.rowCount || 0

          // Supprimer les entrées KB
          await client.query(
            'DELETE FROM knowledge_base WHERE id = ANY($1)',
            [oldKbIds]
          )

          // Mettre à jour les web_pages
          await client.query(
            `UPDATE web_pages SET
              knowledge_base_id = NULL,
              is_indexed = false,
              chunks_count = 0,
              last_indexed_at = NULL,
              updated_at = NOW()
            WHERE knowledge_base_id = ANY($1)`,
            [oldKbIds]
          )

          await client.query('COMMIT')
          console.log(`[BulkApprove] 🧹 Nettoyé : ${oldKbEntriesCleaned} KB entries, ${oldChunksCleaned} chunks`)
        } catch (error) {
          await client.query('ROLLBACK')
          console.error('[BulkApprove] ❌ Erreur nettoyage KB:', error)
        } finally {
          client.release()
        }
      }
    }

    const totalDurationMs = Date.now() - startTime

    console.log(`[BulkApprove] Terminé : ${successCount}/${documents.length} docs, ${totalChunksCreated} chunks, ${totalDurationMs}ms`)

    return NextResponse.json({
      success: errorCount === 0,
      summary: {
        documentsApproved: successCount,
        documentsFailed: errorCount,
        totalChunksCreated,
        oldKbEntriesCleaned,
        oldChunksCleaned,
        totalDurationMs,
      },
      documents: results,
    })

  } catch (error) {
    console.error('[BulkApprove] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Erreur interne', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
