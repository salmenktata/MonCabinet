/**
 * API Route: Retry des téléchargements de fichiers échoués
 *
 * POST /api/admin/web-sources/retry-failed-downloads
 * Body: { sourceId?: string, limit?: number }
 *
 * Retente le téléchargement des fichiers (PDFs, DOCX) qui ont échoué
 * lors du crawl. Peut cibler une source spécifique ou toutes les sources.
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { downloadPageFiles } from '@/lib/web-scraper/file-indexer-service'
import type { LinkedFile } from '@/lib/web-scraper/types'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Authentification
    const authHeader = request.headers.get('authorization')
    const cronSecret = authHeader?.replace('Bearer ', '')

    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      // OK
    } else {
      const session = await getSession()
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      }
      const isAdmin = await checkAdminAccess(session.user.id)
      if (!isAdmin) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const { sourceId, limit = 50 } = body

    // Trouver les pages avec des fichiers non téléchargés
    const whereClause = sourceId
      ? 'AND wp.web_source_id = $2'
      : ''
    const queryParams: (string | number)[] = [limit]
    if (sourceId) queryParams.push(sourceId)

    const pagesResult = await db.query(
      `SELECT wp.id, wp.web_source_id, wp.linked_files
       FROM web_pages wp
       WHERE wp.linked_files IS NOT NULL
         AND wp.linked_files::text != '[]'
         AND EXISTS (
           SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
           WHERE (f->>'downloaded')::boolean IS NOT TRUE
             AND (f->>'url') IS NOT NULL
         )
         ${whereClause}
       ORDER BY wp.last_crawled_at DESC NULLS LAST
       LIMIT $1`,
      queryParams
    )

    let totalRetried = 0
    let totalSuccess = 0
    let totalFailed = 0
    const errors: string[] = []

    for (const page of pagesResult.rows) {
      const files: LinkedFile[] = page.linked_files || []
      const failedFiles = files.filter(f => !f.downloaded && f.url)

      if (failedFiles.length === 0) continue

      totalRetried += failedFiles.length

      const result = await downloadPageFiles(page.id, files, page.web_source_id)
      totalSuccess += result.downloaded
      totalFailed += result.failed
      errors.push(...result.errors)
    }

    return NextResponse.json({
      success: true,
      pagesProcessed: pagesResult.rows.length,
      filesRetried: totalRetried,
      filesDownloaded: totalSuccess,
      filesFailed: totalFailed,
      errors: errors.slice(0, 50),
    })

  } catch (error) {
    console.error('[API] Erreur retry-failed-downloads:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
