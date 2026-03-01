import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

/**
 * POST /api/admin/web-sources/[id]/organize
 *
 * Lance l'organisation complète (extraction métadonnées + classification) en arrière-plan
 *
 * Cette opération :
 * 1. Extrait les métadonnées structurées (19 champs juridiques)
 * 2. Classifie automatiquement par domaine et type
 * 3. Valide contre listes de référence
 *
 * Body:
 * {
 *   batchSize?: number,      // Nombre de pages par batch (défaut: 10)
 *   concurrency?: number,    // Nombre de requêtes parallèles (défaut: 5)
 *   onlyCategory?: string    // Filtrer par catégorie (défaut: toutes)
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const {
      batchSize = 10,
      concurrency = 5,
      onlyCategory,
    } = body as {
      batchSize?: number
      concurrency?: number
      onlyCategory?: string
    }

    console.log('[Organize] Starting organization for source:', id, {
      batchSize,
      concurrency,
      onlyCategory,
    })

    // Vérifier que la source existe
    const sourceResult = await db.query(
      'SELECT id, name, categories FROM web_sources WHERE id = $1',
      [id]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const source = sourceResult.rows[0]

    // Récupérer les stats initiales
    const statsResult = await db.query<{
      total_pages: string
      pages_with_metadata: string
      pages_without_metadata: string
    }>(
      `SELECT
        COUNT(*) as total_pages,
        COUNT(wpsm.web_page_id) as pages_with_metadata,
        COUNT(*) - COUNT(wpsm.web_page_id) as pages_without_metadata
      FROM web_pages wp
      LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
      WHERE wp.web_source_id = $1`,
      [id]
    )

    const stats = statsResult.rows[0]
    const pagesWithoutMetadata = parseInt(stats.pages_without_metadata, 10)

    if (pagesWithoutMetadata === 0) {
      return NextResponse.json({
        success: true,
        message: 'Toutes les pages sont déjà organisées',
        stats: {
          totalPages: parseInt(stats.total_pages, 10),
          pagesWithMetadata: parseInt(stats.pages_with_metadata, 10),
          pagesWithoutMetadata: 0,
        },
      })
    }

    // Option 1 : Lancer un job en background (recommandé pour grosses quantités)
    // Pour l'instant, on lance un batch synchrone pour tester

    // Importer le service d'extraction
    const { extractStructuredMetadata } = await import(
      '@/lib/web-scraper/metadata-extractor-service'
    )

    // Traiter un premier batch de manière synchrone (pour feedback immédiat)
    const firstBatchSize = Math.min(batchSize, 5) // Max 5 pour le premier batch

    let query = `
      SELECT wp.id, wp.url
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM web_page_structured_metadata wpsm
          WHERE wpsm.web_page_id = wp.id
        )
      ORDER BY wp.created_at DESC
      LIMIT $2
    `
    const queryParams: (string | number)[] = [id, firstBatchSize]

    const pagesResult = await db.query(query, queryParams)

    if (pagesResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune page à organiser',
        processed: 0,
      })
    }

    // Traiter le premier batch
    const errors: Array<{ pageId: string; url: string; error: string }> = []
    const results: string[] = []

    for (const page of pagesResult.rows) {
      try {
        await extractStructuredMetadata(page.id)
        results.push(page.id)
        console.log(`[Organize] ✅ ${page.url}`)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
        errors.push({
          pageId: page.id,
          url: page.url,
          error: errorMsg,
        })
        console.error(`[Organize] ❌ ${page.url} - ${errorMsg}`)
      }
    }

    // Récupérer les nouvelles stats après le batch
    const newStatsResult = await db.query<{
      total_pages: string
      pages_with_metadata: string
      pages_without_metadata: string
    }>(
      `SELECT
        COUNT(*) as total_pages,
        COUNT(wpsm.web_page_id) as pages_with_metadata,
        COUNT(*) - COUNT(wpsm.web_page_id) as pages_without_metadata
      FROM web_pages wp
      LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
      WHERE wp.web_source_id = $1`,
      [id]
    )

    const newStats = newStatsResult.rows[0]

    return NextResponse.json({
      success: true,
      message: `Premier batch terminé : ${results.length} pages organisées${errors.length > 0 ? `, ${errors.length} échecs` : ''}. L'organisation continue en arrière-plan via le cron.`,
      processed: results.length,
      failed: errors.length,
      errors: errors.slice(0, 5),
      stats: {
        totalPages: parseInt(newStats.total_pages, 10),
        pagesWithMetadata: parseInt(newStats.pages_with_metadata, 10),
        pagesWithoutMetadata: parseInt(newStats.pages_without_metadata, 10),
        coveragePercent: parseFloat(
          (
            (parseInt(newStats.pages_with_metadata, 10) /
              parseInt(newStats.total_pages, 10)) *
            100
          ).toFixed(2)
        ),
      },
      info: {
        sourceName: source.name,
        remainingPages: parseInt(newStats.pages_without_metadata, 10),
        cronInfo:
          'Le cron /api/cron/extract-metadata traite automatiquement les pages restantes toutes les 5 minutes.',
      },
    })
  } catch (error) {
    console.error('[Organize] Fatal error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
