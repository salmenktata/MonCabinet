import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

/**
 * POST /api/super-admin/classification/bulk-validate
 *
 * Valide en masse N pages telles quelles (approve as-is).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await req.json()
    const { pageIds } = body

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return NextResponse.json({ error: 'Missing or empty pageIds array' }, { status: 400 })
    }

    // Limit to 200 items per call
    const ids = pageIds.slice(0, 200)

    // Insert correction records (approved as-is) for all pages
    await db.query(
      `INSERT INTO classification_corrections (
        web_page_id, page_url, page_title,
        original_category, original_domain, original_document_type, original_confidence,
        corrected_category, corrected_domain, corrected_document_type,
        classification_signals, corrected_by
      )
      SELECT
        wp.id, wp.url, wp.title,
        lc.primary_category, lc.domain, lc.document_nature, lc.confidence_score,
        lc.primary_category, lc.domain, lc.document_nature,
        COALESCE(lc.signals_used, '{}'), $1
      FROM web_pages wp
      LEFT JOIN legal_classifications lc ON lc.web_page_id = wp.id
      WHERE wp.id = ANY($2::uuid[])`,
      [session.user.id, ids]
    )

    // Mark all as validated
    const updateResult = await db.query(
      `UPDATE legal_classifications
       SET requires_validation = false,
           validated_by = $1,
           validated_at = NOW()
       WHERE web_page_id = ANY($2::uuid[])`,
      [session.user.id, ids]
    )

    return NextResponse.json({
      success: true,
      count: updateResult.rowCount ?? ids.length,
    })
  } catch (error) {
    console.error('[Classification Bulk Validate API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
