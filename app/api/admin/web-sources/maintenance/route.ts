/**
 * API Route: Maintenance Web Sources
 * Actions de maintenance pour les sources web (cleanup, réindexation, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { reindexLongDocuments } from '@/lib/web-scraper/reindex-long-documents'

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
        // Archiver les pages avec contenu insuffisant
        const result = await db.query(
          `UPDATE web_pages
           SET
             status = 'removed',
             error_message = 'Contenu insuffisant pour indexation (<100 caractères)',
             updated_at = NOW()
           WHERE web_source_id = $1
           AND status = 'crawled'
           AND is_indexed = false
           AND (LENGTH(extracted_text) < 100 OR extracted_text IS NULL)
           RETURNING id`,
          [sourceId]
        )

        return NextResponse.json({
          success: true,
          action: 'cleanup_insufficient',
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
           WHERE web_source_id = $1
           AND status = 'failed'
           AND error_count < 3
           ORDER BY last_crawled_at DESC
           LIMIT $2
           RETURNING id`,
          [sourceId, limit]
        )

        return NextResponse.json({
          success: true,
          action: 'retry_failed',
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

    // Totaux
    const total = await db.query(
      `SELECT
         COUNT(*) as total_pages,
         COUNT(*) FILTER (WHERE is_indexed = true) as total_indexed,
         SUM(chunks_count) as total_chunks,
         COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
         COUNT(*) FILTER (WHERE status = 'removed') as total_removed,
         COUNT(*) FILTER (WHERE status = 'crawled' AND is_indexed = false) as pending_index
       FROM web_pages
       WHERE web_source_id = $1`,
      [sourceId]
    )

    // Actions disponibles
    const actions = {
      cleanup_insufficient: {
        available: total.rows[0].pending_index > 0,
        count: total.rows[0].pending_index,
      },
      reindex_long_documents: {
        available: total.rows[0].total_failed > 0,
        count: total.rows[0].total_failed,
      },
      cleanup_temp_files: {
        available: true,
        count: 0, // Calculé dynamiquement
      },
      retry_failed: {
        available: total.rows[0].total_failed > 0,
        count: total.rows[0].total_failed,
      },
    }

    return NextResponse.json({
      success: true,
      byStatus: stats.rows,
      totals: total.rows[0],
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
