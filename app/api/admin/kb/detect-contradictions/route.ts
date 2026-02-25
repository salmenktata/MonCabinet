/**
 * POST /api/admin/kb/detect-contradictions
 *
 * Lance la détection de contradictions juridiques sur un batch de pages web indexées.
 * Sélectionne les pages qui n'ont jamais été vérifiées (aucune entrée dans content_contradictions).
 *
 * Body:
 *   batchSize   (default: 3, max: 10) — nombre de pages à analyser
 *   sourceUrl   (optional)            — filtrer par domaine source (ex: "9anoun.tn")
 *
 * Réponse:
 *   processed, succeeded, failed, totalFound, remaining
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { detectContradictions } from '@/lib/web-scraper/contradiction-detector-service'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  const startTime = Date.now()

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '3', 10), 10)
    const sourceUrlFilter: string | null = body.sourceUrl || null

    // Sélectionner des pages indexées avec un doc KB, pas encore vérifiées pour contradictions
    const queryParams: unknown[] = [batchSize]
    let whereClause = `
      wp.is_indexed = true
      AND wp.knowledge_base_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM content_contradictions cc
        WHERE cc.source_page_id = wp.id
      )
    `

    if (sourceUrlFilter) {
      queryParams.push(`%${sourceUrlFilter}%`)
      whereClause += ` AND ws.base_url ILIKE $${queryParams.length}`
    }

    const joinClause = sourceUrlFilter
      ? 'LEFT JOIN web_sources ws ON wp.web_source_id = ws.id'
      : ''

    const pagesResult = await db.query<{
      page_id: string
      title: string
      url: string
    }>(`
      SELECT wp.id as page_id, wp.title, wp.url
      FROM web_pages wp
      ${joinClause}
      WHERE ${whereClause}
      ORDER BY wp.updated_at DESC
      LIMIT $1
    `, queryParams)

    const pages = pagesResult.rows

    // Compter le total restant
    const remainingParams: unknown[] = []
    let remainingWhere = `
      wp.is_indexed = true
      AND wp.knowledge_base_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM content_contradictions cc
        WHERE cc.source_page_id = wp.id
      )
    `
    if (sourceUrlFilter) {
      remainingParams.push(`%${sourceUrlFilter}%`)
      remainingWhere += ` AND ws.base_url ILIKE $${remainingParams.length}`
    }

    const remainingJoin = sourceUrlFilter
      ? 'LEFT JOIN web_sources ws ON wp.web_source_id = ws.id'
      : ''

    const remainingResult = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM web_pages wp
      ${remainingJoin}
      WHERE ${remainingWhere}
    `, remainingParams)
    const remaining = parseInt(remainingResult.rows[0]?.count || '0', 10)

    if (pages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Toutes les pages ont déjà été vérifiées pour contradictions',
        processed: 0,
        succeeded: 0,
        failed: 0,
        totalFound: 0,
        remaining: 0,
        duration: Date.now() - startTime,
      })
    }

    console.log(`[DetectContradictions] ${pages.length} pages à analyser, ${remaining} restantes au total`)

    let succeeded = 0
    let failed = 0
    let totalFound = 0
    const results: Array<{
      pageId: string
      title: string
      success: boolean
      contradictionsFound?: number
      severity?: string
      error?: string
    }> = []

    for (const page of pages) {
      try {
        const result = await detectContradictions(page.page_id)
        const found = result.contradictions.length

        succeeded++
        totalFound += found
        results.push({
          pageId: page.page_id,
          title: page.title || page.url,
          success: true,
          contradictionsFound: found,
          severity: result.severity,
        })
        console.log(`[DetectContradictions] ✅ "${page.title || page.url}" → ${found} contradiction(s) (${result.severity})`)
      } catch (err) {
        failed++
        const msg = getErrorMessage(err)
        results.push({
          pageId: page.page_id,
          title: page.title || page.url,
          success: false,
          error: msg,
        })
        console.error(`[DetectContradictions] ❌ "${page.title || page.url}": ${msg}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Détection terminée: ${succeeded}/${pages.length} analysées, ${totalFound} contradiction(s) trouvée(s)`,
      processed: pages.length,
      succeeded,
      failed,
      totalFound,
      remaining: Math.max(0, remaining - succeeded),
      duration: Date.now() - startTime,
      results,
    })
  } catch (error) {
    console.error('[DetectContradictions] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
