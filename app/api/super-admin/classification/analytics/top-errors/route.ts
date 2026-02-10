import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

interface TopError {
  key: string
  count: number
  avgConfidence: number
  examples: Array<{
    url: string
    title: string | null
    priority: string | null
  }>
}

/**
 * GET /api/super-admin/classification/analytics/top-errors
 * 
 * Récupère les top erreurs de classification groupées par domaine/source/raison
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const groupBy = searchParams.get('groupBy') || 'domain'
    const limit = parseInt(searchParams.get('limit') || '20')

    // Validate groupBy
    const validGroupBy = ['domain', 'source', 'reason']
    if (!validGroupBy.includes(groupBy)) {
      return NextResponse.json(
        { error: `Invalid groupBy. Must be one of: ${validGroupBy.join(', ')}` },
        { status: 400 }
      )
    }

    // Determine column to group by
    let groupColumn: string
    let exampleColumn: string

    switch (groupBy) {
      case 'domain':
        groupColumn = 'lc.domain'
        exampleColumn = 'domain'
        break
      case 'source':
        groupColumn = 'ws.name'
        exampleColumn = 'source_name'
        break
      case 'reason':
        groupColumn = 'lc.validation_reason'
        exampleColumn = 'validation_reason'
        break
      default:
        groupColumn = 'lc.domain'
        exampleColumn = 'domain'
    }

    // Get top errors
    const errorsQuery = `
      SELECT
        ${groupColumn} AS key,
        COUNT(*) AS count,
        AVG(lc.confidence_score) AS avg_confidence
      FROM legal_classifications lc
      JOIN web_pages wp ON wp.id = lc.web_page_id
      JOIN web_sources ws ON ws.id = wp.web_source_id
      WHERE lc.requires_validation = true
        AND ${groupColumn} IS NOT NULL
      GROUP BY ${groupColumn}
      ORDER BY count DESC
      LIMIT $1
    `

    const errorsResult = await db.query(errorsQuery, [limit])

    // For each error, get examples
    const errors: TopError[] = await Promise.all(
      errorsResult.rows.map(async (row: any) => {
        const examplesQuery = `
          SELECT
            wp.url,
            wp.title,
            lc.review_priority AS priority
          FROM legal_classifications lc
          JOIN web_pages wp ON wp.id = lc.web_page_id
          JOIN web_sources ws ON ws.id = wp.web_source_id
          WHERE lc.requires_validation = true
            AND ${groupColumn} = $1
          ORDER BY lc.created_at DESC
          LIMIT 3
        `

        const examplesResult = await db.query(examplesQuery, [row.key])

        return {
          key: row.key,
          count: parseInt(row.count),
          avgConfidence: parseFloat(row.avg_confidence),
          examples: examplesResult.rows.map((ex: any) => ({
            url: ex.url,
            title: ex.title,
            priority: ex.priority,
          })),
        }
      })
    )

    // Get total pages requiring review
    const totalResult = await db.query(
      'SELECT COUNT(*) FROM legal_classifications WHERE requires_validation = true'
    )
    const totalPagesRequiringReview = parseInt(totalResult.rows[0].count)

    // Get distribution by domain
    const byDomainResult = await db.query(`
      SELECT domain, COUNT(*) AS count
      FROM legal_classifications
      WHERE requires_validation = true AND domain IS NOT NULL
      GROUP BY domain
    `)
    const byDomain: Record<string, number> = {}
    byDomainResult.rows.forEach((row: any) => {
      byDomain[row.domain] = parseInt(row.count)
    })

    // Get distribution by source
    const bySourceResult = await db.query(`
      SELECT ws.name AS source, COUNT(*) AS count
      FROM legal_classifications lc
      JOIN web_pages wp ON wp.id = lc.web_page_id
      JOIN web_sources ws ON ws.id = wp.web_source_id
      WHERE lc.requires_validation = true
      GROUP BY ws.name
    `)
    const bySource: Record<string, number> = {}
    bySourceResult.rows.forEach((row: any) => {
      bySource[row.source] = parseInt(row.count)
    })

    // Get distribution by priority
    const byPriorityResult = await db.query(`
      SELECT review_priority, COUNT(*) AS count
      FROM legal_classifications
      WHERE requires_validation = true AND review_priority IS NOT NULL
      GROUP BY review_priority
    `)
    const byPriority: Record<string, number> = {}
    byPriorityResult.rows.forEach((row: any) => {
      byPriority[row.review_priority] = parseInt(row.count)
    })

    return NextResponse.json({
      errors,
      totalPagesRequiringReview,
      byDomain,
      bySource,
      byPriority,
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
