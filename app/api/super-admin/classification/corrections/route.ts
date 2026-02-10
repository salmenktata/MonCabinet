import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordClassificationCorrection } from '@/lib/web-scraper/classification-learning-service'

interface CorrectionHistoryItem {
  id: string
  web_page_id: string
  page_url: string
  page_title: string | null
  original_category: string
  original_domain: string | null
  corrected_category: string
  corrected_domain: string | null
  corrected_document_type: string | null
  corrected_by: string
  has_generated_rule: boolean
  created_at: string
}

/**
 * GET /api/super-admin/classification/corrections
 * 
 * Récupère l'historique des corrections avec filtres
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const hasRuleFilter = searchParams.get('hasRule')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = `
      SELECT
        cc.id,
        cc.web_page_id,
        wp.url AS page_url,
        wp.title AS page_title,
        cc.original_category,
        cc.original_domain,
        cc.corrected_category,
        cc.corrected_domain,
        cc.corrected_document_type,
        cc.corrected_by,
        cc.has_generated_rule,
        cc.created_at
      FROM classification_corrections cc
      JOIN web_pages wp ON wp.id = cc.web_page_id
    `

    const params: any[] = []
    const conditions: string[] = []

    if (hasRuleFilter === 'true') {
      conditions.push('cc.has_generated_rule = true')
    } else if (hasRuleFilter === 'false') {
      conditions.push('cc.has_generated_rule = false')
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ')
    }

    query += ' ORDER BY cc.created_at DESC LIMIT $1 OFFSET $2'
    params.push(limit, offset)

    const result = await db.query(query, params)

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM classification_corrections cc'
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ')
    }

    const countResult = await db.query(countQuery)
    const total = parseInt(countResult.rows[0].count)

    const items: CorrectionHistoryItem[] = result.rows

    return NextResponse.json({
      items,
      total,
    })
  } catch (error) {
    console.error('Error fetching corrections history:', error)
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
 * POST /api/super-admin/classification/corrections
 * 
 * Enregistre une nouvelle correction
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      pageId,
      correctedCategory,
      correctedDomain,
      correctedDocumentType,
      feedback,
    } = body

    // Validate required fields
    if (!pageId || !correctedCategory) {
      return NextResponse.json(
        { error: 'Missing required fields: pageId, correctedCategory' },
        { status: 400 }
      )
    }

    // Record correction (will trigger rule generation if applicable)
    const correctionId = await recordClassificationCorrection(
      pageId,
      'super-admin', // TODO: Get from session
      {
        category: correctedCategory,
        domain: correctedDomain || null,
        documentType: correctedDocumentType || null,
      }
    )

    // Check if a rule was generated
    const correctionResult = await db.query(
      'SELECT has_generated_rule FROM classification_corrections WHERE id = $1',
      [correctionId]
    )
    const hasGeneratedRule = correctionResult.rows[0]?.has_generated_rule || false

    // Save feedback if provided
    if (feedback && typeof feedback.isUseful === 'boolean') {
      await db.query(
        `
        INSERT INTO classification_feedback (correction_id, is_useful, notes, created_by)
        VALUES ($1, $2, $3, $4)
        `,
        [correctionId, feedback.isUseful, feedback.notes || null, 'super-admin']
      )
    }

    return NextResponse.json({
      correctionId,
      hasGeneratedRule,
    })
  } catch (error) {
    console.error('Error saving correction:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
