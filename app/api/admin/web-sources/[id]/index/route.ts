/**
 * API Route: Administration - Indexer une source web
 *
 * POST /api/admin/web-sources/[id]/index
 * - Indexe toutes les pages non indexées d'une source
 * - Paramètres: limit (nombre de pages max), reindex (réindexer les pages déjà indexées)
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getWebSource } from '@/lib/web-scraper'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'
import { safeParseInt } from '@/lib/utils/safe-number'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

async function checkCronAuth(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('Authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return authHeader === `Bearer ${cronSecret}`
}

// =============================================================================
// POST: Indexer les pages d'une source
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Accepter CRON_SECRET comme alternative à la session admin
    const isCron = await checkCronAuth(request)
    if (!isCron) {
      const session = await getSession()
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      }
      const isAdmin = await checkAdminAccess(session.user.id)
      if (!isAdmin) {
        return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
      }
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))

    const limit = body.limit || 100
    const reindex = body.reindex === true

    // Récupérer la source
    const source = await getWebSource(id)
    if (!source) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    // Compter les pages à indexer
    // FIX: Inclure aussi les pages 'unchanged' qui n'ont jamais été indexées
    const countResult = await db.query(
      `SELECT COUNT(*) as count FROM web_pages
       WHERE web_source_id = $1
       AND status IN ('crawled', 'unchanged')
       ${reindex ? '' : 'AND is_indexed = false'}`,
      [id]
    )
    const totalToIndex = parseInt(countResult.rows[0].count, 10)

    if (totalToIndex === 0) {
      return NextResponse.json({
        message: 'Aucune page à indexer',
        processed: 0,
        succeeded: 0,
        failed: 0,
      })
    }

    // Lancer l'indexation
    const result = await indexSourcePages(id, { limit, reindex })

    return NextResponse.json({
      message: `Indexation terminée: ${result.succeeded}/${result.processed} réussies`,
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      remaining: Math.max(0, totalToIndex - result.processed),
    })
  } catch (error) {
    console.error('Erreur indexation web source:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur indexation source',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET: Statut d'indexation d'une source
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params

    // Stats d'indexation
    const statsResult = await db.query(
      `SELECT
        COUNT(*) as total_pages,
        COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages,
        COUNT(*) FILTER (WHERE status = 'crawled' AND is_indexed = false) as pending_pages,
        COALESCE(SUM(chunks_count), 0) as total_chunks
       FROM web_pages
       WHERE web_source_id = $1`,
      [id]
    )

    const stats = statsResult.rows[0]

    return NextResponse.json({
      totalPages: parseInt(stats.total_pages, 10),
      indexedPages: parseInt(stats.indexed_pages, 10),
      pendingPages: parseInt(stats.pending_pages, 10),
      totalChunks: parseInt(stats.total_chunks, 10),
    })
  } catch (error) {
    console.error('Erreur stats indexation:', error)
    return NextResponse.json(
      { error: 'Erreur récupération stats' },
      { status: 500 }
    )
  }
}
