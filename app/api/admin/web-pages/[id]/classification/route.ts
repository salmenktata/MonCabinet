import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/web-pages/[id]/classification
 *
 * Récupère les détails de classification d'une page web spécifique.
 */
export const GET = withAdminApiAuth(async (request, ctx, _session) => {
  try {
    const { id: pageId } = await ctx.params!

    if (!pageId) {
      return NextResponse.json({ error: 'Missing page ID' }, { status: 400 })
    }

    // Get page info
    const pageResult = await db.query(
      `SELECT wp.id, wp.url, wp.title, wp.content_hash, ws.name AS source_name
       FROM web_pages wp
       JOIN web_sources ws ON ws.id = wp.web_source_id
       WHERE wp.id = $1`,
      [pageId]
    )

    if (pageResult.rows.length === 0) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const page = pageResult.rows[0]

    // Get classification
    const classifResult = await db.query(
      `SELECT
        lc.id,
        lc.primary_category AS "primaryCategory",
        lc.subcategory,
        lc.domain,
        lc.subdomain,
        lc.document_nature AS "documentNature",
        lc.confidence_score AS "confidenceScore",
        lc.requires_validation AS "requiresValidation",
        lc.validation_reason AS "validationReason",
        lc.review_priority AS "reviewPriority",
        lc.review_estimated_effort AS "reviewEstimatedEffort",
        lc.alternative_classifications AS "alternativeClassifications",
        lc.legal_keywords AS "legalKeywords",
        lc.classification_source AS "classificationSource",
        lc.signals_used AS "signalsUsed",
        lc.llm_provider AS "llmProvider",
        lc.llm_model AS "llmModel",
        lc.tokens_used AS "tokensUsed",
        lc.classified_at AS "classifiedAt",
        lc.validated_by AS "validatedBy",
        lc.validated_at AS "validatedAt"
       FROM legal_classifications lc
       WHERE lc.web_page_id = $1
       ORDER BY lc.classified_at DESC
       LIMIT 1`,
      [pageId]
    )

    // Get correction history for this page
    const correctionsResult = await db.query(
      `SELECT
        cc.id,
        cc.original_category,
        cc.corrected_category,
        cc.original_domain,
        cc.corrected_domain,
        cc.corrected_at,
        cc.corrected_by
       FROM classification_corrections cc
       WHERE cc.web_page_id = $1
       ORDER BY cc.corrected_at DESC
       LIMIT 10`,
      [pageId]
    )

    return NextResponse.json({
      page: {
        id: page.id,
        url: page.url,
        title: page.title,
        sourceName: page.source_name,
      },
      classification: classifResult.rows[0] || null,
      corrections: correctionsResult.rows,
    })
  } catch (error) {
    console.error('[Web Page Classification API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
})
