import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

/**
 * POST /api/super-admin/classification/validate
 *
 * Valide rapidement une page telle quelle (approve as-is),
 * sans modifier la classification existante.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { pageId, action } = body

    if (!pageId) {
      return NextResponse.json({ error: 'Missing required field: pageId' }, { status: 400 })
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

    // Insert a correction record (approved as-is)
    await db.query(
      `INSERT INTO classification_corrections (
        web_page_id, page_url, page_title,
        original_category, original_domain, original_document_type, original_confidence,
        corrected_category, corrected_domain, corrected_document_type,
        classification_signals, corrected_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        pageId,
        page.url,
        page.title,
        page.primary_category,
        page.domain,
        page.document_nature,
        page.confidence_score,
        page.primary_category,
        page.domain,
        page.document_nature,
        page.signals_used || '{}',
        session.user.id,
      ]
    )

    // Mark as validated
    await db.query(
      `UPDATE legal_classifications
       SET requires_validation = false,
           validated_by = $1,
           validated_at = NOW()
       WHERE web_page_id = $2`,
      [session.user.id, pageId]
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Classification Validate API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
