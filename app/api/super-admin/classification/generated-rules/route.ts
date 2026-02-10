import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/super-admin/classification/generated-rules
 *
 * Récupère les règles auto-générées depuis les corrections
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const sourceId = searchParams.get('sourceId') || null
    const isActive = searchParams.get('isActive')
    const minAccuracy = parseFloat(searchParams.get('minAccuracy') || '0')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query with filters
    let query = `
      SELECT
        scr.id,
        scr.name,
        scr.web_source_id,
        ws.name AS source_name,
        scr.conditions,
        scr.target_category,
        scr.target_domain,
        scr.target_document_type,
        scr.priority,
        scr.is_active,
        scr.times_matched,
        scr.times_correct,
        CASE
          WHEN scr.times_matched > 0
          THEN ROUND((scr.times_correct::NUMERIC / scr.times_matched::NUMERIC) * 100, 1)
          ELSE 0
        END AS accuracy,
        scr.created_at,
        scr.last_matched_at,
        COUNT(cc.id) AS corrections_count
      FROM source_classification_rules scr
      JOIN web_sources ws ON ws.id = scr.web_source_id
      LEFT JOIN classification_corrections cc ON cc.generated_rule_id = scr.id
      WHERE scr.created_by IS NOT NULL
    `

    const params: any[] = []
    let paramIndex = 1

    if (sourceId) {
      query += ` AND scr.web_source_id = $${paramIndex}`
      params.push(sourceId)
      paramIndex++
    }

    if (isActive === 'true') {
      query += ` AND scr.is_active = true`
    } else if (isActive === 'false') {
      query += ` AND scr.is_active = false`
    }

    query += ` GROUP BY scr.id, ws.name`

    if (minAccuracy > 0) {
      query += ` HAVING (scr.times_matched = 0 OR (scr.times_correct::NUMERIC / scr.times_matched::NUMERIC) >= $${paramIndex})`
      params.push(minAccuracy / 100)
      paramIndex++
    }

    query += ` ORDER BY scr.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(limit, offset)

    const result = await db.query(query, params)

    // Get total count
    let countQuery = `
      SELECT COUNT(DISTINCT scr.id)
      FROM source_classification_rules scr
      WHERE scr.created_by IS NOT NULL
    `
    const countParams: any[] = []
    let countIndex = 1

    if (sourceId) {
      countQuery += ` AND scr.web_source_id = $${countIndex}`
      countParams.push(sourceId)
      countIndex++
    }

    if (isActive === 'true') {
      countQuery += ` AND scr.is_active = true`
    } else if (isActive === 'false') {
      countQuery += ` AND scr.is_active = false`
    }

    const countResult = await db.query(countQuery, countParams)
    const total = parseInt(countResult.rows[0].count)

    const items = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      webSourceId: row.web_source_id,
      sourceName: row.source_name,
      conditions: row.conditions,
      classification: {
        category: row.target_category,
        domain: row.target_domain,
        documentType: row.target_document_type,
      },
      priority: row.priority,
      isActive: row.is_active,
      timesMatched: parseInt(row.times_matched || '0'),
      timesCorrect: parseInt(row.times_correct || '0'),
      accuracy: parseFloat(row.accuracy || '0'),
      createdFromCorrections: parseInt(row.corrections_count) > 0,
      correctionsCount: parseInt(row.corrections_count),
      createdAt: row.created_at,
      lastMatchedAt: row.last_matched_at,
    }))

    return NextResponse.json({
      items,
      total,
    })
  } catch (error) {
    console.error('Error fetching generated rules:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/super-admin/classification/generated-rules
 *
 * Met à jour une règle (activer/désactiver)
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { ruleId, isActive } = body

    if (!ruleId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing required fields: ruleId, isActive' },
        { status: 400 }
      )
    }

    await db.query(
      `UPDATE source_classification_rules SET is_active = $1, updated_at = NOW() WHERE id = $2`,
      [isActive, ruleId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating rule:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
