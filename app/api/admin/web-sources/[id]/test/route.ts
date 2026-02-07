/**
 * API Route: Administration - Tester l'extraction d'une source
 *
 * POST /api/admin/web-sources/[id]/test
 * - Teste l'extraction de contenu sur une URL (sans sauvegarder)
 * - Utile pour valider la configuration CSS
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getWebSource, scrapeUrl } from '@/lib/web-scraper'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role; return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// POST: Tester l'extraction
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
    const body = await request.json()

    // URL à tester (par défaut: URL de base)
    const testUrl = body.url

    // Récupérer la source
    const source = await getWebSource(id)
    if (!source) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const urlToTest = testUrl || source.baseUrl

    // Valider l'URL
    try {
      new URL(urlToTest)
    } catch {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
    }

    // Tester l'extraction
    const result = await scrapeUrl(urlToTest, {
      ...source,
      // Override éventuels pour le test
      cssSelectors: body.cssSelectors || source.cssSelectors,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          fetchResult: result.fetchResult ? {
            statusCode: result.fetchResult.statusCode,
            error: result.fetchResult.error,
          } : null,
        },
        { status: 400 }
      )
    }

    const content = result.content!

    return NextResponse.json({
      success: true,
      url: urlToTest,
      extraction: {
        title: content.title,
        description: content.description,
        author: content.author,
        date: content.date,
        language: content.language,
        keywords: content.keywords,
        contentLength: content.content.length,
        contentPreview: content.content.substring(0, 500) + (content.content.length > 500 ? '...' : ''),
        htmlLength: content.html.length,
        linksCount: content.links.length,
        filesCount: content.files.length,
        files: content.files.slice(0, 5),
        structuredData: content.structuredData ? Object.keys(content.structuredData) : null,
      },
      fetchResult: {
        statusCode: result.fetchResult?.statusCode,
        finalUrl: result.fetchResult?.finalUrl,
        etag: result.fetchResult?.etag,
        lastModified: result.fetchResult?.lastModified,
      },
    })
  } catch (error) {
    console.error('Erreur test extraction:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur test extraction',
      },
      { status: 500 }
    )
  }
}
