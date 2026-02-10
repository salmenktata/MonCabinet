import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/super-admin/classification/analytics/top-errors
 *
 * Analyse des erreurs de classification les plus fréquentes.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const groupBy = searchParams.get('groupBy') || 'domain'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Run all analytics queries in parallel
    const [totalResult, byPriorityResult, byDomainResult, bySourceResult, errorsResult] =
      await Promise.all([
        // Total pages requiring review
        db.query(
          `SELECT COUNT(*) AS total FROM legal_classifications WHERE requires_validation = true`
        ),

        // Distribution by priority
        db.query(`
          SELECT
            COALESCE(review_priority, 'none') AS priority,
            COUNT(*) AS count
          FROM legal_classifications
          WHERE requires_validation = true
          GROUP BY review_priority
          ORDER BY CASE review_priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
            ELSE 5
          END
        `),

        // Distribution by domain
        db.query(`
          SELECT
            COALESCE(lc.domain, 'non spécifié') AS domain,
            COUNT(*) AS count
          FROM legal_classifications lc
          WHERE lc.requires_validation = true
          GROUP BY lc.domain
          ORDER BY count DESC
        `),

        // Distribution by source
        db.query(`
          SELECT
            ws.name AS source,
            COUNT(*) AS count
          FROM legal_classifications lc
          JOIN web_pages wp ON wp.id = lc.web_page_id
          JOIN web_sources ws ON ws.id = wp.web_source_id
          WHERE lc.requires_validation = true
          GROUP BY ws.name
          ORDER BY count DESC
        `),

        // Top errors grouped by the selected dimension
        groupBy === 'domain'
          ? db.query(
              `SELECT
                COALESCE(lc.domain, 'non spécifié') AS key,
                COUNT(*) AS count,
                AVG(lc.confidence_score) AS avg_confidence,
                json_agg(json_build_object(
                  'url', wp.url,
                  'title', wp.title,
                  'priority', lc.review_priority
                ) ORDER BY lc.confidence_score ASC) FILTER (WHERE wp.url IS NOT NULL) AS examples
              FROM legal_classifications lc
              JOIN web_pages wp ON wp.id = lc.web_page_id
              WHERE lc.requires_validation = true
              GROUP BY lc.domain
              ORDER BY count DESC
              LIMIT $1`,
              [limit]
            )
          : groupBy === 'source'
          ? db.query(
              `SELECT
                ws.name AS key,
                COUNT(*) AS count,
                AVG(lc.confidence_score) AS avg_confidence,
                json_agg(json_build_object(
                  'url', wp.url,
                  'title', wp.title,
                  'priority', lc.review_priority
                ) ORDER BY lc.confidence_score ASC) FILTER (WHERE wp.url IS NOT NULL) AS examples
              FROM legal_classifications lc
              JOIN web_pages wp ON wp.id = lc.web_page_id
              JOIN web_sources ws ON ws.id = wp.web_source_id
              WHERE lc.requires_validation = true
              GROUP BY ws.name
              ORDER BY count DESC
              LIMIT $1`,
              [limit]
            )
          : db.query(
              `SELECT
                COALESCE(lc.validation_reason, 'Raison inconnue') AS key,
                COUNT(*) AS count,
                AVG(lc.confidence_score) AS avg_confidence,
                json_agg(json_build_object(
                  'url', wp.url,
                  'title', wp.title,
                  'priority', lc.review_priority
                ) ORDER BY lc.confidence_score ASC) FILTER (WHERE wp.url IS NOT NULL) AS examples
              FROM legal_classifications lc
              JOIN web_pages wp ON wp.id = lc.web_page_id
              WHERE lc.requires_validation = true
              GROUP BY lc.validation_reason
              ORDER BY count DESC
              LIMIT $1`,
              [limit]
            ),
      ])

    // Transform results
    const byPriority: Record<string, number> = {}
    for (const row of byPriorityResult.rows) {
      byPriority[row.priority] = parseInt(row.count) || 0
    }

    const byDomain: Record<string, number> = {}
    for (const row of byDomainResult.rows) {
      byDomain[row.domain] = parseInt(row.count) || 0
    }

    const bySource: Record<string, number> = {}
    for (const row of bySourceResult.rows) {
      bySource[row.source] = parseInt(row.count) || 0
    }

    const errors = errorsResult.rows.map((row: any) => ({
      key: row.key,
      count: parseInt(row.count) || 0,
      avgConfidence: parseFloat(row.avg_confidence) || 0,
      examples: (row.examples || []).slice(0, 3),
    }))

    return NextResponse.json(
      {
        totalPagesRequiringReview: parseInt(totalResult.rows[0].total) || 0,
        byPriority,
        byDomain,
        bySource,
        errors,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('[Classification Analytics API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
