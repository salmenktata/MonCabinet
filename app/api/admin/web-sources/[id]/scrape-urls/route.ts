/**
 * API Route: Scrape une liste d'URLs connues (sans crawl)
 *
 * POST /api/admin/web-sources/[id]/scrape-urls
 * Body: { urls: string[], concurrency?: number, indexAfterScrape?: boolean, downloadFiles?: boolean }
 *
 * Bypass la phase de découverte du crawler pour traiter directement des URLs connues.
 * Utile pour : re-indexer des pages, importer des listes JORT, traiter des URLs manuelles.
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getWebSource } from '@/lib/web-scraper'
import { scrapeUrlList } from '@/lib/web-scraper/crawler-service'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// POST: Scrape une liste d'URLs
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // Authentification : Session admin OU CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const cronSecret = authHeader?.replace('Bearer ', '')

    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      // OK — authentifié via CRON_SECRET
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

    const { id } = await params
    const body = await request.json()

    // Validation du body
    const { urls, concurrency, indexAfterScrape, downloadFiles } = body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: 'Le champ "urls" est requis et doit être un tableau non vide' },
        { status: 400 }
      )
    }

    if (urls.length > 500) {
      return NextResponse.json(
        { error: 'Maximum 500 URLs par requête' },
        { status: 400 }
      )
    }

    // Valider que toutes les URLs sont des strings valides
    const invalidUrls = urls.filter((u: unknown) => {
      if (typeof u !== 'string') return true
      try { new URL(u); return false } catch { return true }
    })

    if (invalidUrls.length > 0) {
      return NextResponse.json(
        { error: `${invalidUrls.length} URL(s) invalide(s)`, invalidUrls: invalidUrls.slice(0, 10) },
        { status: 400 }
      )
    }

    // Récupérer la source
    const source = await getWebSource(id)
    if (!source) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    // Lancer le scrape
    const result = await scrapeUrlList(source, urls, {
      concurrency: concurrency || 5,
      indexAfterScrape: indexAfterScrape ?? false,
      downloadFiles: downloadFiles ?? source.downloadFiles,
    })

    return NextResponse.json(result)

  } catch (error) {
    console.error('[API] Erreur scrape-urls:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur interne' },
      { status: 500 }
    )
  }
}
