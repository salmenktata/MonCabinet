import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

interface BulkExtractionStats {
  totalPages: number
  pagesWithMetadata: number
  pagesWithoutMetadata: number
  estimatedTimeMinutes: number
  estimatedCost: number
}

/**
 * GET - Obtenir les statistiques pour l'extraction bulk
 */
export async function GET(
  _request: NextRequest,
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

    // Compter les pages avec/sans métadonnées
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

    // Estimation temps : ~15s par page avec LLM, mais seulement ~50% utilisent LLM
    // Avec concurrency 5 : temps / 5
    const avgTimePerPage = 10 // secondes (moyenne entre regex seul et LLM)
    const concurrency = 5
    const estimatedTimeMinutes = Math.ceil((pagesWithoutMetadata * avgTimePerPage) / 60 / concurrency)

    // Estimation coût : ~50% utilisent LLM, Ollama gratuit, DeepSeek ~$0.0001 par appel
    const llmUsagePercent = 0.5
    const avgCostPerLLMCall = 0.0001
    const estimatedCost = pagesWithoutMetadata * llmUsagePercent * avgCostPerLLMCall

    const response: BulkExtractionStats = {
      totalPages: parseInt(stats.total_pages, 10),
      pagesWithMetadata: parseInt(stats.pages_with_metadata, 10),
      pagesWithoutMetadata,
      estimatedTimeMinutes,
      estimatedCost,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Erreur GET bulk metadata stats:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

/**
 * POST - Lancer l'extraction bulk des métadonnées
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
      skipExisting = true,
      onlyCategory,
    } = body as {
      batchSize?: number
      concurrency?: number
      skipExisting?: boolean
      onlyCategory?: string
    }

    // Récupérer les pages à traiter
    let query = `
      SELECT wp.id, wp.url, wp.title, wp.extracted_text,
             ws.category as source_category
      FROM web_pages wp
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE wp.web_source_id = $1
    `
    const queryParams: (string | number)[] = [id]

    if (skipExisting) {
      query += ` AND NOT EXISTS (
        SELECT 1 FROM web_page_structured_metadata wpsm
        WHERE wpsm.web_page_id = wp.id
      )`
    }

    if (onlyCategory) {
      query += ` AND ws.category = $${queryParams.length + 1}`
      queryParams.push(onlyCategory)
    }

    query += ` ORDER BY wp.created_at DESC LIMIT $${queryParams.length + 1}`
    queryParams.push(batchSize)

    const pagesResult = await db.query(query, queryParams)

    if (pagesResult.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune page à traiter',
        processed: 0,
        errors: [],
      })
    }

    // Traiter les pages en parallèle avec concurrency limit
    const { extractStructuredMetadata } = await import(
      '@/lib/web-scraper/metadata-extractor-service'
    )

    const errors: Array<{ pageId: string; url: string; error: string }> = []
    const results: string[] = []

    // Traiter par batch avec concurrency
    for (let i = 0; i < pagesResult.rows.length; i += concurrency) {
      const batch = pagesResult.rows.slice(i, i + concurrency)

      const batchPromises = batch.map(async (page) => {
        try {
          await extractStructuredMetadata(page.id)
          results.push(page.id)
          console.log(`[Bulk Metadata] ✅ Extracted: ${page.url}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
          errors.push({
            pageId: page.id,
            url: page.url,
            error: errorMsg,
          })
          console.error(`[Bulk Metadata] ❌ Failed: ${page.url} - ${errorMsg}`)
        }
      })

      await Promise.all(batchPromises)

      // Log progression
      const progress = Math.min(i + concurrency, pagesResult.rows.length)
      console.log(
        `[Bulk Metadata] Progress: ${progress}/${pagesResult.rows.length} (${Math.round((progress / pagesResult.rows.length) * 100)}%)`
      )
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      errors: errors.slice(0, 10), // Limiter à 10 erreurs pour éviter réponse trop longue
      hasMore: pagesResult.rows.length === batchSize,
      message: `Extraction terminée : ${results.length} réussies, ${errors.length} échecs`,
    })
  } catch (error) {
    console.error('Erreur POST bulk metadata:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
