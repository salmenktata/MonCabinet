import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/super-admin/classification/corrections
 *
 * Récupère l'historique des corrections de classification.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const hasRule = searchParams.get('hasRule')

    let query = `
      SELECT
        cc.id,
        cc.web_page_id,
        cc.page_url,
        cc.page_title,
        cc.original_category,
        cc.original_domain,
        cc.original_document_type,
        cc.original_confidence,
        cc.corrected_category,
        cc.corrected_domain,
        cc.corrected_document_type,
        cc.corrected_by,
        cc.corrected_at,
        cc.generated_rule_id,
        cc.generated_rule_id IS NOT NULL AS has_generated_rule,
        cc.created_at
      FROM classification_corrections cc
      WHERE 1=1
    `

    const params: any[] = []
    let paramIndex = 1

    if (hasRule === 'true') {
      query += ` AND cc.generated_rule_id IS NOT NULL`
    } else if (hasRule === 'false') {
      query += ` AND cc.generated_rule_id IS NULL`
    }

    query += ` ORDER BY cc.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(limit, offset)

    const result = await db.query(query, params)

    // Count total
    let countQuery = `SELECT COUNT(*) FROM classification_corrections WHERE 1=1`
    if (hasRule === 'true') {
      countQuery += ` AND generated_rule_id IS NOT NULL`
    } else if (hasRule === 'false') {
      countQuery += ` AND generated_rule_id IS NULL`
    }

    const countResult = await db.query(countQuery)
    const total = parseInt(countResult.rows[0].count) || 0

    return NextResponse.json({
      items: result.rows,
      total,
    })
  } catch (error) {
    console.error('[Classification Corrections API] GET Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/super-admin/classification/corrections
 *
 * Enregistre une correction manuelle de classification.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { pageId, correctedCategory, correctedDomain, correctedDocumentType, feedback } = body

    if (!pageId || !correctedCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: pageId, correctedCategory' },
        { status: 400 }
      )
    }

    // Get page info and current classification
    const pageResult = await db.query(
      `SELECT wp.url, wp.title, lc.primary_category, lc.domain, lc.document_nature, lc.confidence_score, lc.signals_used
       FROM web_pages wp
       LEFT JOIN legal_classifications lc ON lc.web_page_id = wp.id
       WHERE wp.id = $1`,
      [pageId]
    )

    if (pageResult.rows.length === 0) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const page = pageResult.rows[0]

    // Insert correction
    const correctionResult = await db.query(
      `INSERT INTO classification_corrections (
        web_page_id, page_url, page_title,
        original_category, original_domain, original_document_type, original_confidence,
        corrected_category, corrected_domain, corrected_document_type,
        classification_signals, corrected_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        pageId,
        page.url,
        page.title,
        page.primary_category,
        page.domain,
        page.document_nature,
        page.confidence_score,
        correctedCategory,
        correctedDomain || null,
        correctedDocumentType || null,
        page.signals_used || '{}',
        session.user.id,
      ]
    )

    const correctionId = correctionResult.rows[0].id

    // Update the classification to mark as validated
    await db.query(
      `UPDATE legal_classifications
       SET requires_validation = false,
           validated_by = $1,
           validated_at = NOW(),
           primary_category = $2,
           domain = $3,
           document_nature = $4
       WHERE web_page_id = $5`,
      [session.user.id, correctedCategory, correctedDomain || null, correctedDocumentType || null, pageId]
    )

    // Save feedback if provided
    if (feedback) {
      await db.query(
        `INSERT INTO classification_feedback (correction_id, is_useful, notes, created_by)
         VALUES ($1, $2, $3, $4)`,
        [correctionId, feedback.isUseful, feedback.notes || null, session.user.id]
      )
    }

    return NextResponse.json({
      success: true,
      correctionId,
      hasGeneratedRule: false,
    })
  } catch (error) {
    console.error('[Classification Corrections API] POST Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
