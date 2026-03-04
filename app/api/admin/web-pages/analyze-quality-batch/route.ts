/**
 * POST /api/admin/web-pages/analyze-quality-batch
 *
 * Analyse la qualité d'un batch de web_pages sans quality_score.
 * Appelle analyzeContentQuality() pour chaque page.
 *
 * Body params:
 * - batchSize    (default: 20, max: 100)  Nombre de pages à analyser
 * - sourceId     (optional)               Filtrer par web_source.id
 * - sourceUrl    (optional)               Filtrer par web_source.base_url (ILIKE)
 * - skipAnalyzed (default: true)          Ignorer pages déjà analysées
 *
 * GET: Statistiques qualité par source
 */

import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { db } from '@/lib/db/postgres'
import { analyzeContentQuality } from '@/lib/web-scraper/content-analyzer-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const maxDuration = 300

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '20', 10), 100)
    const sourceId: string | null = body.sourceId || null
    const sourceUrl: string | null = body.sourceUrl || null
    const skipAnalyzed: boolean = body.skipAnalyzed !== false

    console.log('[WebPages Quality] Démarrage:', { batchSize, sourceId, sourceUrl, skipAnalyzed })

    // Construire la requête
    const params: unknown[] = []
    let paramIdx = 1

    let query = `
      SELECT wp.id, wp.url, wp.title, ws.name as source_name
      FROM web_pages wp
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE wp.is_indexed = true
    `

    if (skipAnalyzed) {
      query += ` AND wp.quality_score IS NULL`
    }

    if (sourceId) {
      query += ` AND wp.web_source_id = $${paramIdx}`
      params.push(sourceId)
      paramIdx++
    }

    if (sourceUrl) {
      query += ` AND ws.base_url ILIKE $${paramIdx}`
      params.push(`%${sourceUrl}%`)
      paramIdx++
    }

    query += ` ORDER BY wp.created_at ASC LIMIT $${paramIdx}`
    params.push(batchSize)

    const result = await db.query<{
      id: string
      url: string
      title: string | null
      source_name: string
    }>(query, params)

    const pages = result.rows

    if (pages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucune page à analyser',
        analyzed: 0,
        succeeded: 0,
        failed: 0,
      })
    }

    console.log(`[WebPages Quality] ${pages.length} pages à analyser`)

    const results: Array<{
      pageId: string
      url: string
      success: boolean
      qualityScore?: number
      error?: string
      processingTimeMs: number
    }> = []

    let succeeded = 0
    let failed = 0

    for (const page of pages) {
      const startTime = Date.now()

      try {
        const analysis = await analyzeContentQuality(page.id)

        results.push({
          pageId: page.id,
          url: page.url,
          success: true,
          qualityScore: analysis.overallScore,
          processingTimeMs: Date.now() - startTime,
        })

        succeeded++
        console.log(`   ✅ ${page.url.substring(0, 60)} → ${analysis.overallScore}/100`)
      } catch (error) {
        console.error(`[WebPages Quality] ❌ ${page.url}:`, getErrorMessage(error))

        results.push({
          pageId: page.id,
          url: page.url,
          success: false,
          error: getErrorMessage(error),
          processingTimeMs: Date.now() - startTime,
        })

        failed++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Analyse terminée: ${succeeded}/${pages.length} réussies`,
      analyzed: pages.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('[WebPages Quality] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  try {
    const stats = await db.query<{
      source_name: string
      total_indexed: number
      with_score: number
      without_score: number
      avg_quality: number | null
      pct_scored: number | null
    }>(`
      SELECT
        ws.name as source_name,
        COUNT(wp.id) as total_indexed,
        COUNT(wp.id) FILTER (WHERE wp.quality_score IS NOT NULL) as with_score,
        COUNT(wp.id) FILTER (WHERE wp.quality_score IS NULL) as without_score,
        ROUND(AVG(wp.quality_score)::numeric, 1) as avg_quality,
        ROUND(100.0 * COUNT(wp.id) FILTER (WHERE wp.quality_score IS NOT NULL) / NULLIF(COUNT(wp.id), 0), 1) as pct_scored
      FROM web_sources ws
      JOIN web_pages wp ON ws.id = wp.web_source_id
      WHERE wp.is_indexed = true
        AND ws.rag_enabled = true
      GROUP BY ws.id, ws.name
      ORDER BY without_score DESC
    `)

    return NextResponse.json({
      success: true,
      sources: stats.rows,
    })
  } catch (error) {
    console.error('[WebPages Quality] Erreur stats:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
