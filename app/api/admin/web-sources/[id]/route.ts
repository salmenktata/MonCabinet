/**
 * API Route: Administration - Source Web individuelle
 *
 * GET /api/admin/web-sources/[id]
 * - Récupère les détails d'une source
 *
 * PUT /api/admin/web-sources/[id]
 * - Met à jour une source
 *
 * DELETE /api/admin/web-sources/[id]
 * - Supprime une source
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  getWebSource,
  updateWebSource,
  listWebPages,
  listCrawlLogs,
} from '@/lib/web-scraper'
import { getSourceIndexingStats } from '@/lib/web-scraper/web-indexer-service'
import { deleteWebSourceComplete, getDeletePreview } from '@/lib/web-scraper/delete-service'
import type { UpdateWebSourceInput } from '@/lib/web-scraper'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role; return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// GET: Détails d'une source
// =============================================================================

export async function GET(
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
    const { searchParams } = new URL(request.url)
    const includePages = searchParams.get('includePages') === 'true'
    const includeLogs = searchParams.get('includeLogs') === 'true'
    const includeStats = searchParams.get('includeStats') === 'true'

    const source = await getWebSource(id)
    if (!source) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const response: Record<string, unknown> = { source }

    if (includePages) {
      const { pages, total } = await listWebPages(id, { limit: 20 })
      response.pages = pages
      response.pagesTotal = total
    }

    if (includeLogs) {
      const logs = await listCrawlLogs(id, { limit: 10 })
      response.logs = logs
    }

    if (includeStats) {
      const stats = await getSourceIndexingStats(id)
      response.indexingStats = stats
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Erreur récupération web source:', error)
    return NextResponse.json(
      { error: 'Erreur récupération source' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PUT: Mettre à jour une source
// =============================================================================

export async function PUT(
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

    // Vérifier que la source existe
    const existing = await getWebSource(id)
    if (!existing) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const input: UpdateWebSourceInput = {}

    // Copier les champs fournis
    if (body.name !== undefined) input.name = body.name
    if (body.baseUrl !== undefined) input.baseUrl = body.baseUrl
    if (body.description !== undefined) input.description = body.description
    if (body.category !== undefined) input.category = body.category
    if (body.language !== undefined) input.language = body.language
    if (body.priority !== undefined) input.priority = body.priority
    if (body.crawlFrequency !== undefined) input.crawlFrequency = body.crawlFrequency
    if (body.maxDepth !== undefined) input.maxDepth = body.maxDepth
    if (body.maxPages !== undefined) input.maxPages = body.maxPages
    if (body.requiresJavascript !== undefined) input.requiresJavascript = body.requiresJavascript
    if (body.cssSelectors !== undefined) input.cssSelectors = body.cssSelectors
    if (body.urlPatterns !== undefined) input.urlPatterns = body.urlPatterns
    if (body.excludedPatterns !== undefined) input.excludedPatterns = body.excludedPatterns
    if (body.sitemapUrl !== undefined) input.sitemapUrl = body.sitemapUrl
    if (body.rssFeedUrl !== undefined) input.rssFeedUrl = body.rssFeedUrl
    if (body.useSitemap !== undefined) input.useSitemap = body.useSitemap
    if (body.downloadFiles !== undefined) input.downloadFiles = body.downloadFiles
    if (body.respectRobotsTxt !== undefined) input.respectRobotsTxt = body.respectRobotsTxt
    if (body.rateLimitMs !== undefined) input.rateLimitMs = body.rateLimitMs
    if (body.customHeaders !== undefined) input.customHeaders = body.customHeaders
    if (body.isActive !== undefined) input.isActive = body.isActive
    if (body.ragEnabled !== undefined) input.ragEnabled = body.ragEnabled
    if (body.ignoreSSLErrors !== undefined) input.ignoreSSLErrors = body.ignoreSSLErrors
    if (body.autoIndexFiles !== undefined) input.autoIndexFiles = body.autoIndexFiles

    const source = await updateWebSource(id, input)

    // Invalider le cache client pour les pages de détail et d'édition
    revalidatePath(`/super-admin/web-sources/${id}`)
    revalidatePath(`/super-admin/web-sources/${id}/edit`)

    return NextResponse.json({
      message: 'Source mise à jour',
      source,
    })
  } catch (error) {
    console.error('Erreur mise à jour web source:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Erreur mise à jour source',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer une source (COMPLÈTE avec KB)
// =============================================================================

export async function DELETE(
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
    const { searchParams } = new URL(request.url)
    const previewOnly = searchParams.get('preview') === 'true'

    // Mode aperçu : retourner ce qui serait supprimé sans supprimer
    if (previewOnly) {
      try {
        const preview = await getDeletePreview(id)
        return NextResponse.json({
          preview: true,
          ...preview,
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'Source non trouvée') {
          return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
        }
        throw error
      }
    }

    // Mode suppression réelle
    console.log(`[API DELETE] Suppression source ${id}...`)
    const result = await deleteWebSourceComplete(id)

    // Cas 1: Source non trouvée (avant transaction)
    if (!result.success && result.errors.some(e => e.includes('Source non trouvée'))) {
      console.log(`[API DELETE] ❌ Source ${id} non trouvée`)
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    // Cas 2: Jobs en cours (blocage)
    if (!result.success && result.errors.some(e => e.includes('job(s) en cours'))) {
      console.log(`[API DELETE] ⚠️  Jobs en cours, suppression bloquée`)
      return NextResponse.json({
        error: 'Impossible de supprimer la source',
        message: result.errors[0],
        details: result.errors,
      }, { status: 409 }) // 409 Conflict
    }

    // Cas 3: Erreur durant la transaction
    if (!result.success) {
      console.error(`[API DELETE] ❌ Erreur suppression:`, result.errors)
      return NextResponse.json({
        error: 'Erreur lors de la suppression',
        message: result.errors[0] || 'Une erreur est survenue',
        details: result.errors,
        stats: result.stats,
      }, { status: 500 })
    }

    // Cas 4: Transaction OK mais source pas supprimée (ne devrait pas arriver)
    if (!result.sourceDeleted) {
      console.warn(`[API DELETE] ⚠️  Transaction OK mais source ${id} pas supprimée`)
      return NextResponse.json({
        error: 'Source non supprimée',
        message: 'La transaction a réussi mais la source n\'a pas été supprimée',
        details: result.errors,
      }, { status: 500 })
    }

    // Cas 5: Succès !
    console.log(`[API DELETE] ✅ Source ${id} supprimée avec succès`)

    // Invalider le cache
    revalidatePath('/super-admin/web-sources')

    return NextResponse.json({
      message: 'Source supprimée avec succès',
      stats: result.stats,
      warnings: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (error) {
    console.error('[API DELETE] ❌ Exception non gérée:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur lors de la suppression',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
