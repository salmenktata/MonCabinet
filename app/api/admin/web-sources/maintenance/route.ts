/**
 * API Route: Maintenance Web Sources
 * Actions de maintenance pour les sources web (cleanup, réindexation, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { reindexLongDocuments } from '@/lib/web-scraper/reindex-long-documents'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 600 // 10 minutes

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'super_admin'
}

// =============================================================================
// POST: Exécuter une action de maintenance
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Accès réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { action, sourceId, options = {} } = body

    console.log(`[WebMaintenance] Action: ${action}, Source: ${sourceId}`)

    switch (action) {
      case 'cleanup_insufficient': {
        // Archiver les pages avec contenu insuffisant (< min_word_count de la source, défaut 30)
        const result = await db.query(
          `UPDATE web_pages wp
           SET
             status = 'removed',
             error_message = 'Contenu insuffisant pour indexation (< ' ||
               COALESCE((SELECT min_word_count FROM web_sources WHERE id = wp.web_source_id), 30)::text
               || ' mots)',
             updated_at = NOW()
           WHERE wp.web_source_id = $1
           AND wp.status IN ('crawled', 'pending')
           AND wp.is_indexed = false
           AND (
             wp.word_count < COALESCE((SELECT min_word_count FROM web_sources WHERE id = wp.web_source_id), 30)
             OR wp.extracted_text IS NULL
           )
           RETURNING wp.id`,
          [sourceId]
        )

        return NextResponse.json({
          success: true,
          action: 'cleanup_insufficient',
          pagesArchived: result.rowCount,
        })
      }

      case 'cleanup_thin_pages': {
        // Nettoyage global : toutes les sources, respecte min_word_count par source
        const dryRun = options.dryRun !== false // default: true (sécurité)
        const minWordCountOverride: number | null = options.minWordCount ?? null

        const countResult = await db.query(
          `SELECT COUNT(*) as count
           FROM web_pages wp
           JOIN web_sources ws ON ws.id = wp.web_source_id
           WHERE wp.status IN ('crawled', 'pending')
           AND wp.is_indexed = false
           AND (
             wp.word_count < COALESCE($1, ws.min_word_count, 30)
             OR wp.extracted_text IS NULL
           )
           ${sourceId ? 'AND wp.web_source_id = $2' : ''}`,
          sourceId ? [minWordCountOverride, sourceId] : [minWordCountOverride]
        )

        const affected = parseInt(countResult.rows[0].count)

        if (dryRun) {
          return NextResponse.json({
            success: true,
            action: 'cleanup_thin_pages',
            dryRun: true,
            pagesAffected: affected,
            message: `${affected} pages seraient archivées (dryRun=true, passer dryRun:false pour exécuter)`,
          })
        }

        const result = await db.query(
          `UPDATE web_pages wp
           SET
             status = 'removed',
             error_message = 'Contenu insuffisant: ' || COALESCE(wp.word_count, 0)::text || ' mots',
             updated_at = NOW()
           WHERE wp.status IN ('crawled', 'pending')
           AND wp.is_indexed = false
           AND (
             wp.word_count < COALESCE($1, (SELECT min_word_count FROM web_sources WHERE id = wp.web_source_id), 30)
             OR wp.extracted_text IS NULL
           )
           ${sourceId ? 'AND wp.web_source_id = $2' : ''}
           RETURNING wp.id`,
          sourceId ? [minWordCountOverride, sourceId] : [minWordCountOverride]
        )

        console.log(`[WebMaintenance] cleanup_thin_pages: ${result.rowCount} pages archivées`)

        return NextResponse.json({
          success: true,
          action: 'cleanup_thin_pages',
          dryRun: false,
          pagesArchived: result.rowCount,
        })
      }

      case 'reindex_long_documents': {
        // Réindexer les documents trop longs avec découpage
        const limit = options.limit || 10
        const dryRun = options.dryRun || false

        const result = await reindexLongDocuments(sourceId, { limit, dryRun })

        return NextResponse.json({
          action: 'reindex_long_documents',
          ...result,
        })
      }

      case 'get_statistics': {
        // Récupérer statistiques détaillées
        const stats = await db.query(
          `SELECT
             status,
             COUNT(*) as count,
             COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
             ROUND(AVG(LENGTH(extracted_text)), 0) as avg_text_length,
             MIN(LENGTH(extracted_text)) as min_text_length,
             MAX(LENGTH(extracted_text)) as max_text_length
           FROM web_pages
           WHERE web_source_id = $1
           GROUP BY status
           ORDER BY count DESC`,
          [sourceId]
        )

        const total = await db.query(
          `SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_indexed = true) as total_indexed,
             SUM(chunks_count) as total_chunks
           FROM web_pages
           WHERE web_source_id = $1`,
          [sourceId]
        )

        return NextResponse.json({
          success: true,
          action: 'get_statistics',
          byStatus: stats.rows,
          totals: total.rows[0],
        })
      }

      case 'cleanup_temp_files': {
        // Archiver les fichiers temporaires Word (~$*.doc)
        const result = await db.query(
          `UPDATE web_pages
           SET
             status = 'removed',
             error_message = 'Fichier temporaire Word',
             updated_at = NOW()
           WHERE web_source_id = $1
           AND status = 'crawled'
           AND is_indexed = false
           AND (
             title LIKE '~$%'
             OR url LIKE '%/~$%'
           )
           RETURNING id`,
          [sourceId]
        )

        return NextResponse.json({
          success: true,
          action: 'cleanup_temp_files',
          filesArchived: result.rowCount,
        })
      }

      case 'retry_failed': {
        // Réinitialiser les pages failed pour retry
        const limit = options.limit || 50

        const result = await db.query(
          `UPDATE web_pages
           SET
             status = 'pending',
             error_message = NULL,
             error_count = 0,
             updated_at = NOW()
           WHERE id IN (
             SELECT id FROM web_pages
             WHERE web_source_id = $1
             AND status = 'failed'
             AND error_count < 3
             ORDER BY last_crawled_at DESC
             LIMIT $2
           )
           RETURNING id`,
          [sourceId, limit]
        )

        return NextResponse.json({
          success: true,
          action: 'retry_failed',
          pagesReset: result.rowCount,
        })
      }

      case 'index_pending': {
        // Déclencher l'indexation RAG des pages prêtes (crawled + sufficient content)
        // indexSourcePages contient son propre guard rag_enabled
        const limit = options.limit || 50
        const indexResult = await indexSourcePages(sourceId, { limit, reindex: false })

        return NextResponse.json({
          success: true,
          action: 'index_pending',
          processed: indexResult.processed,
          succeeded: indexResult.succeeded,
          failed: indexResult.failed,
        })
      }

      case 'reset_stuck': {
        // Réinitialiser les pages bloquées définitivement (error_count >= 3)
        const result = await db.query(
          `UPDATE web_pages
           SET
             status = 'pending',
             error_message = NULL,
             error_count = 0,
             updated_at = NOW()
           WHERE id IN (
             SELECT id FROM web_pages
             WHERE web_source_id = $1
             AND status = 'failed'
             AND error_count >= 3
             ORDER BY last_crawled_at ASC
             LIMIT 100
           )
           RETURNING id`,
          [sourceId]
        )

        return NextResponse.json({
          success: true,
          action: 'reset_stuck',
          pagesReset: result.rowCount,
        })
      }

      default:
        return NextResponse.json(
          { error: `Action inconnue: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('[WebMaintenance] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur maintenance',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET: Obtenir les statistiques
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Accès réservé aux super administrateurs' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const sourceId = searchParams.get('sourceId')

    if (!sourceId) {
      return NextResponse.json({ error: 'sourceId requis' }, { status: 400 })
    }

    // Statistiques par status
    const stats = await db.query(
      `SELECT
         status,
         COUNT(*) as count,
         COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
         ROUND(AVG(LENGTH(extracted_text)), 0) as avg_text_length,
         MIN(LENGTH(extracted_text)) as min_text_length,
         MAX(LENGTH(extracted_text)) as max_text_length
       FROM web_pages
       WHERE web_source_id = $1
       GROUP BY status
       ORDER BY count DESC`,
      [sourceId]
    )

    // Totaux + compteurs précis par action (en une seule query)
    const total = await db.query(
      `SELECT
         COUNT(*) as total_pages,
         COUNT(*) FILTER (WHERE is_indexed = true) as total_indexed,
         SUM(chunks_count) as total_chunks,
         COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
         COUNT(*) FILTER (WHERE status = 'removed') as total_removed,
         -- pages prêtes à indexer (crawled/unchanged + non indexées + contenu suffisant)
         COUNT(*) FILTER (
           WHERE status IN ('crawled', 'unchanged')
           AND is_indexed = false
           AND word_count >= COALESCE(
             (SELECT min_word_count FROM web_sources WHERE id = wp.web_source_id), 30
           )
           AND extracted_text IS NOT NULL
         ) as pending_index,
         -- pages avec contenu insuffisant (à archiver)
         COUNT(*) FILTER (
           WHERE status IN ('crawled', 'pending', 'unchanged')
           AND is_indexed = false
           AND (
             word_count < COALESCE(
               (SELECT min_word_count FROM web_sources WHERE id = wp.web_source_id), 30
             )
             OR extracted_text IS NULL
           )
         ) as cleanup_insufficient_count,
         -- fichiers temporaires Word (~$*)
         COUNT(*) FILTER (
           WHERE status = 'crawled'
           AND is_indexed = false
           AND (title LIKE '~$%' OR url LIKE '%/~$%')
         ) as cleanup_temp_files_count,
         -- documents failed avec erreur "trop long"
         COUNT(*) FILTER (
           WHERE status = 'failed'
           AND error_message LIKE '%trop long%'
           AND LENGTH(extracted_text) > 50000
         ) as reindex_long_count,
         -- pages bloquées définitivement (error_count >= 3)
         COUNT(*) FILTER (
           WHERE status = 'failed'
           AND error_count >= 3
         ) as stuck_count
       FROM web_pages wp
       WHERE wp.web_source_id = $1`,
      [sourceId]
    )

    // Chunks RAG actifs pour cette source (2 chemins de liaison possibles)
    const ragChunksResult = await db.query(
      `SELECT COUNT(kbc.id) as active_rag_chunks
       FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
       WHERE kb.is_indexed = true
       AND (
         kb.metadata->>'web_source_id' = $1
         OR kb.id IN (
           SELECT knowledge_base_id FROM web_pages
           WHERE web_source_id = $1 AND knowledge_base_id IS NOT NULL
         )
       )`,
      [sourceId]
    )
    const activeRagChunks = parseInt(ragChunksResult.rows[0]?.active_rag_chunks ?? '0', 10)

    const totals = total.rows[0]

    // Actions disponibles avec compteurs corrects
    const actions = {
      cleanup_insufficient: {
        available: parseInt(totals.cleanup_insufficient_count, 10) > 0,
        count: parseInt(totals.cleanup_insufficient_count, 10),
      },
      reindex_long_documents: {
        available: parseInt(totals.reindex_long_count, 10) > 0,
        count: parseInt(totals.reindex_long_count, 10),
      },
      cleanup_temp_files: {
        available: parseInt(totals.cleanup_temp_files_count, 10) > 0,
        count: parseInt(totals.cleanup_temp_files_count, 10),
      },
      retry_failed: {
        available: parseInt(totals.total_failed, 10) > 0,
        count: parseInt(totals.total_failed, 10),
      },
      index_pending: {
        available: parseInt(totals.pending_index, 10) > 0,
        count: parseInt(totals.pending_index, 10),
      },
      reset_stuck: {
        available: parseInt(totals.stuck_count, 10) > 0,
        count: parseInt(totals.stuck_count, 10),
      },
    }

    return NextResponse.json({
      success: true,
      byStatus: stats.rows,
      totals: {
        ...totals,
        active_rag_chunks: activeRagChunks,
      },
      actions,
    })
  } catch (error) {
    console.error('[WebMaintenance] Erreur GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur stats',
      },
      { status: 500 }
    )
  }
}
