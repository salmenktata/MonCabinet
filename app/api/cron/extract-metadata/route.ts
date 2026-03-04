import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { extractStructuredMetadata } from '@/lib/web-scraper/metadata-extractor-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

interface ExtractMetadataParams {
  sourceId?: string
  batchSize?: number
  concurrency?: number
  skipExisting?: boolean
  onlyCategory?: string
}

/**
 * POST /api/cron/extract-metadata
 *
 * Endpoint protégé par CRON_SECRET pour extraction bulk de métadonnées
 * Traite un batch de pages sans métadonnées
 *
 * Body:
 * {
 *   sourceId?: string,       // ID de la web_source (défaut: toutes)
 *   batchSize?: number,      // Nombre de pages par batch (défaut: 10)
 *   concurrency?: number,    // Nombre de requêtes parallèles (défaut: 5)
 *   skipExisting?: boolean,  // Skip pages avec métadonnées (défaut: true)
 *   onlyCategory?: string    // Filtrer par catégorie (défaut: toutes)
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier CRON_SECRET
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron Extract Metadata] Unauthorized request')
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as ExtractMetadataParams

    const {
      sourceId,
      batchSize = 10,
      concurrency = 5,
      skipExisting = true,
      onlyCategory,
    } = body

    console.log('[Cron Extract Metadata] Starting batch extraction', {
      sourceId: sourceId || 'all',
      batchSize,
      concurrency,
      skipExisting,
      onlyCategory,
    })

    // Construire la requête pour récupérer les pages à traiter
    let query = `
      SELECT wp.id, wp.url, wp.title, wp.extracted_text,
             array_to_string(ws.categories, ',') as source_category, ws.name as source_name
      FROM web_pages wp
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE 1=1
    `
    const queryParams: (string | number)[] = []

    // Filtrer par source si spécifié
    if (sourceId) {
      query += ` AND wp.web_source_id = $${queryParams.length + 1}`
      queryParams.push(sourceId)
    }

    // Skip pages with existing metadata
    if (skipExisting) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM web_page_structured_metadata wpsm
        WHERE wpsm.web_page_id = wp.id
      )`
    }

    // Filtrer par catégorie si spécifié
    if (onlyCategory) {
      query += ` AND $${queryParams.length + 1} = ANY(ws.categories)`
      queryParams.push(onlyCategory)
    }

    // Trier par date de création DESC pour traiter les pages récentes en premier
    query += ` ORDER BY wp.created_at DESC LIMIT $${queryParams.length + 1}`
    queryParams.push(batchSize)

    const pagesResult = await db.query(query, queryParams)

    if (pagesResult.rows.length === 0) {
      console.log('[Cron Extract Metadata] No pages to process')
      return NextResponse.json({
        success: true,
        message: 'Aucune page à traiter',
        processed: 0,
        failed: 0,
        hasMore: false,
      })
    }

    console.log(`[Cron Extract Metadata] Processing ${pagesResult.rows.length} pages`)

    // Traiter les pages en parallèle avec concurrency limit
    const errors: Array<{ pageId: string; url: string; error: string }> = []
    const results: string[] = []
    const startTime = Date.now()

    // Traiter par batch avec concurrency
    for (let i = 0; i < pagesResult.rows.length; i += concurrency) {
      const batch = pagesResult.rows.slice(i, i + concurrency)

      const batchPromises = batch.map(async (page) => {
        try {
          await extractStructuredMetadata(page.id)
          results.push(page.id)
          console.log(`[Cron Extract Metadata] ✅ ${page.url}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
          errors.push({
            pageId: page.id,
            url: page.url,
            error: errorMsg,
          })
          console.error(`[Cron Extract Metadata] ❌ ${page.url} - ${errorMsg}`)
        }
      })

      await Promise.all(batchPromises)

      // Log progression
      const progress = Math.min(i + concurrency, pagesResult.rows.length)
      console.log(
        `[Cron Extract Metadata] Progress: ${progress}/${pagesResult.rows.length} (${Math.round((progress / pagesResult.rows.length) * 100)}%)`
      )
    }

    const duration = Math.floor((Date.now() - startTime) / 1000)

    // Récupérer les stats globales après traitement
    const statsQuery = `
      SELECT
        COUNT(*) as total_pages,
        COUNT(wpsm.web_page_id) as pages_with_metadata,
        COUNT(*) - COUNT(wpsm.web_page_id) as pages_without_metadata
      FROM web_pages wp
      LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
      ${sourceId ? 'WHERE wp.web_source_id = $1' : ''}
    `
    const statsParams = sourceId ? [sourceId] : []
    const statsResult = await db.query(statsQuery, statsParams)
    const stats = statsResult.rows[0]

    console.log('[Cron Extract Metadata] Batch completed', {
      processed: results.length,
      failed: errors.length,
      duration: `${duration}s`,
      totalPages: stats.total_pages,
      pagesWithMetadata: stats.pages_with_metadata,
      pagesWithoutMetadata: stats.pages_without_metadata,
    })

    return NextResponse.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      errors: errors.slice(0, 10), // Limiter à 10 erreurs
      hasMore: pagesResult.rows.length === batchSize,
      duration: `${duration}s`,
      stats: {
        totalPages: parseInt(stats.total_pages, 10),
        pagesWithMetadata: parseInt(stats.pages_with_metadata, 10),
        pagesWithoutMetadata: parseInt(stats.pages_without_metadata, 10),
        coveragePercent: parseFloat(
          (
            (parseInt(stats.pages_with_metadata, 10) / parseInt(stats.total_pages, 10)) *
            100
          ).toFixed(2)
        ),
      },
      message: `Extraction terminée : ${results.length} réussies, ${errors.length} échecs`,
    })
  } catch (error) {
    console.error('[Cron Extract Metadata] Fatal error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
