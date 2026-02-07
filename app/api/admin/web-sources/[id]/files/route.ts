/**
 * API Route: Fichiers liés d'une source web
 * GET /api/admin/web-sources/[id]/files - Liste des fichiers
 * POST /api/admin/web-sources/[id]/files - Télécharger et indexer les fichiers
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { indexSourceFiles } from '@/lib/web-scraper/file-indexer-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

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

    // Récupérer toutes les pages avec des fichiers liés
    const result = await db.query(
      `SELECT url, title, linked_files
       FROM web_pages
       WHERE web_source_id = $1
         AND linked_files IS NOT NULL
         AND linked_files::text != '[]'
         AND linked_files::text != 'null'
       ORDER BY last_crawled_at DESC
       LIMIT 100`,
      [id]
    )

    // Extraire et compter les fichiers
    const allFiles: Array<{
      type: string
      url: string
      filename: string
      pageUrl: string
      pageTitle: string
      downloaded: boolean
      source?: string
    }> = []

    for (const row of result.rows) {
      const files = row.linked_files
      if (Array.isArray(files)) {
        for (const f of files) {
          allFiles.push({
            type: f.type || 'unknown',
            url: f.url,
            filename: f.filename,
            pageUrl: row.url,
            pageTitle: row.title || 'Sans titre',
            downloaded: f.downloaded || false,
            source: f.source,
          })
        }
      }
    }

    // Stats par type
    const byType: Record<string, number> = {}
    for (const f of allFiles) {
      byType[f.type] = (byType[f.type] || 0) + 1
    }

    return NextResponse.json({
      totalFiles: allFiles.length,
      byType,
      files: allFiles.slice(0, 50), // Limiter à 50 pour la réponse
    })
  } catch (error) {
    console.error('Erreur récupération fichiers:', error)
    return NextResponse.json(
      { error: 'Erreur récupération fichiers' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Télécharger et indexer les fichiers
// =============================================================================

export async function POST(
  request: NextRequest,
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
    const body = await request.json().catch(() => ({}))
    const limit = body.limit || 50

    // Vérifier que la source existe
    const sourceResult = await db.query(
      'SELECT name FROM web_sources WHERE id = $1',
      [id]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    // Compter les fichiers à traiter
    const countResult = await db.query(
      `SELECT COUNT(*) as count
       FROM web_pages wp
       WHERE wp.web_source_id = $1
         AND wp.linked_files IS NOT NULL
         AND wp.linked_files::text LIKE '%"type":"pdf"%'`,
      [id]
    )
    const totalToProcess = parseInt(countResult.rows[0].count)

    if (totalToProcess === 0) {
      return NextResponse.json({
        message: 'Aucun fichier PDF à traiter',
        downloaded: 0,
        indexed: 0,
        failed: 0,
      })
    }

    // Lancer le téléchargement et l'indexation
    const result = await indexSourceFiles(id, { limit })

    return NextResponse.json({
      message: `Fichiers traités: ${result.indexed} indexés, ${result.downloaded} téléchargés, ${result.failed} échoués`,
      downloaded: result.downloaded,
      indexed: result.indexed,
      failed: result.failed,
      errors: result.errors.slice(0, 10), // Limiter les erreurs affichées
    })
  } catch (error) {
    console.error('Erreur indexation fichiers:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur indexation fichiers',
      },
      { status: 500 }
    )
  }
}
