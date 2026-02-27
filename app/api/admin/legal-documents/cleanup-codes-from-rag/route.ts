import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

/**
 * POST /api/admin/legal-documents/cleanup-codes-from-rag
 *
 * Nettoie le RAG pour la catégorie 'codes' :
 * - Supprime toutes les KB entries issues de web_pages directes (page-level)
 * - Ne conserve que les KB entries issues de legal_documents approuvés
 *
 * Ceci enforce la règle : legal_documents = seule source autorisée pour les codes dans le RAG.
 *
 * Query params:
 * - dry-run=true : Mode simulation, aucune modification
 */
export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const dryRun = request.nextUrl.searchParams.get('dry-run') === 'true'
    const startTime = Date.now()

    // -------------------------------------------------------------------------
    // Étape A : KB entries des web_pages liées à des legal_documents 'codes'
    // Ces pages ont été indexées page-level en parallèle du doc-level → à supprimer
    // -------------------------------------------------------------------------
    const linkedPagesKbResult = await db.query<{ kb_id: string }>(
      `SELECT DISTINCT wp.knowledge_base_id as kb_id
       FROM web_pages wp
       JOIN web_pages_documents wpd ON wp.id = wpd.web_page_id
       JOIN legal_documents ld ON wpd.legal_document_id = ld.id
       WHERE ld.primary_category = 'codes'
         AND wp.knowledge_base_id IS NOT NULL
         AND wp.knowledge_base_id != ALL(
           SELECT COALESCE(knowledge_base_id, '00000000-0000-0000-0000-000000000000'::uuid)
           FROM legal_documents
           WHERE knowledge_base_id IS NOT NULL
         )`
    )

    // -------------------------------------------------------------------------
    // Étape B : KB entries des web_pages codes NON liées à un legal_document
    // Pages crawlées depuis 9anoun.tn/kb/codes/* mais pas encore liées
    // -------------------------------------------------------------------------
    const orphanPagesKbResult = await db.query<{ kb_id: string }>(
      `SELECT DISTINCT wp.knowledge_base_id as kb_id
       FROM web_pages wp
       JOIN web_sources ws ON wp.web_source_id = ws.id
       WHERE (ws.base_url ILIKE '%9anoun.tn%' OR wp.url ILIKE '%9anoun.tn%')
         AND wp.url ILIKE '%/kb/codes/%'
         AND wp.knowledge_base_id IS NOT NULL
         AND wp.id NOT IN (SELECT web_page_id FROM web_pages_documents)
         AND wp.knowledge_base_id != ALL(
           SELECT COALESCE(knowledge_base_id, '00000000-0000-0000-0000-000000000000'::uuid)
           FROM legal_documents
           WHERE knowledge_base_id IS NOT NULL
         )`
    )

    const allKbIdsToDelete = [
      ...linkedPagesKbResult.rows.map(r => r.kb_id),
      ...orphanPagesKbResult.rows.map(r => r.kb_id),
    ]

    // Compter les chunks concernés
    let chunksToDelete = 0
    if (allKbIdsToDelete.length > 0) {
      const countResult = await db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM knowledge_base_chunks
         WHERE knowledge_base_id = ANY($1)`,
        [allKbIdsToDelete]
      )
      chunksToDelete = parseInt(countResult.rows[0].count, 10)
    }

    // Compter les web_pages à réinitialiser (is_indexed=false)
    const pagesToResetResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM web_pages wp
       JOIN web_sources ws ON wp.web_source_id = ws.id
       WHERE (ws.base_url ILIKE '%9anoun.tn%' OR wp.url ILIKE '%9anoun.tn%')
         AND wp.url ILIKE '%/kb/codes/%'
         AND (wp.is_indexed = true OR wp.knowledge_base_id IS NOT NULL)`
    )
    const pagesToReset = parseInt(pagesToResetResult.rows[0].count, 10)

    // Compter les legal_documents codes déjà indexés (à conserver)
    const legalDocsIndexedResult = await db.query<{ count: string; chunks: string }>(
      `SELECT COUNT(ld.id) as count,
              COALESCE(SUM(kb.chunk_count), 0) as chunks
       FROM legal_documents ld
       JOIN knowledge_base kb ON ld.knowledge_base_id = kb.id
       WHERE ld.primary_category = 'codes'
         AND ld.is_approved = true`
    )
    const legalDocsIndexed = parseInt(legalDocsIndexedResult.rows[0].count, 10)
    const legalDocsChunks = parseInt(legalDocsIndexedResult.rows[0].chunks, 10)

    // Compter les legal_documents codes NON encore indexés (à indexer après cleanup)
    const legalDocsPendingResult = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM legal_documents
       WHERE primary_category = 'codes'
         AND consolidation_status = 'complete'
         AND knowledge_base_id IS NULL`
    )
    const legalDocsPending = parseInt(legalDocsPendingResult.rows[0].count, 10)

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        summary: {
          kbEntriesToDelete: allKbIdsToDelete.length,
          chunksToDelete,
          pagesToReset,
          fromLinkedPages: linkedPagesKbResult.rows.length,
          fromOrphanPages: orphanPagesKbResult.rows.length,
          legalDocsAlreadyIndexed: legalDocsIndexed,
          legalDocsChunksToKeep: legalDocsChunks,
          legalDocsPendingIndex: legalDocsPending,
        },
        message: dryRun
          ? `Simulation : suppression de ${allKbIdsToDelete.length} KB entries (${chunksToDelete} chunks) + reset ${pagesToReset} pages. Conservation de ${legalDocsIndexed} legal_documents (${legalDocsChunks} chunks).`
          : '',
      })
    }

    // -------------------------------------------------------------------------
    // Exécution réelle
    // -------------------------------------------------------------------------
    let kbEntriesDeleted = 0
    let chunksDeleted = 0
    let pagesReset = 0

    if (allKbIdsToDelete.length > 0) {
      const client = await db.getClient()
      try {
        await client.query('BEGIN')

        // 1. Supprimer les chunks
        const chunksResult = await client.query(
          `DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = ANY($1)`,
          [allKbIdsToDelete]
        )
        chunksDeleted = chunksResult.rowCount || 0

        // 2. Réinitialiser knowledge_base_id sur web_pages avant de supprimer KB
        await client.query(
          `UPDATE web_pages SET
            knowledge_base_id = NULL,
            is_indexed = false,
            chunks_count = 0,
            last_indexed_at = NULL,
            updated_at = NOW()
          WHERE knowledge_base_id = ANY($1)`,
          [allKbIdsToDelete]
        )

        // 3. Supprimer les KB entries page-level
        const kbResult = await client.query(
          `DELETE FROM knowledge_base WHERE id = ANY($1)`,
          [allKbIdsToDelete]
        )
        kbEntriesDeleted = kbResult.rowCount || 0

        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }

    // 4. Marquer toutes les pages codes comme non-indexées (même celles sans KB entry)
    const pagesResetResult = await db.query(
      `UPDATE web_pages wp SET
        is_indexed = false,
        updated_at = NOW()
      FROM web_sources ws
      WHERE wp.web_source_id = ws.id
        AND (ws.base_url ILIKE '%9anoun.tn%' OR wp.url ILIKE '%9anoun.tn%')
        AND wp.url ILIKE '%/kb/codes/%'
        AND wp.knowledge_base_id IS NULL
        AND wp.is_indexed = true`
    )
    pagesReset = (pagesResetResult.rowCount || 0) + (allKbIdsToDelete.length > 0 ? pagesToReset : 0)

    const totalDurationMs = Date.now() - startTime

    console.log(
      `[CleanupCodes] Terminé : ${kbEntriesDeleted} KB entries supprimées, ` +
      `${chunksDeleted} chunks supprimés, ${pagesReset} pages remises à is_indexed=false (${totalDurationMs}ms). ` +
      `Conservation : ${legalDocsIndexed} legal_documents (${legalDocsChunks} chunks).`
    )

    return NextResponse.json({
      success: true,
      summary: {
        kbEntriesDeleted,
        chunksDeleted,
        pagesReset,
        legalDocsIndexed,
        legalDocsChunksKept: legalDocsChunks,
        legalDocsPendingIndex: legalDocsPending,
        totalDurationMs,
      },
      message: legalDocsPending > 0
        ? `Cleanup terminé. ${legalDocsPending} code(s) dans legal_documents non encore indexés → lancer bulk-approve-index.`
        : `Cleanup terminé. Tous les codes dans legal_documents sont déjà indexés.`,
    })

  } catch (error) {
    console.error('[CleanupCodes] Erreur fatale:', error)
    return NextResponse.json(
      { error: 'Erreur interne', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
