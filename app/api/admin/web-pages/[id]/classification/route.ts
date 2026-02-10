import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/admin/web-pages/[id]/classification
 *
 * Récupère les détails complets de classification d'une page web
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const pageId = params.id

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(pageId)) {
      return NextResponse.json(
        { error: 'Invalid page ID format' },
        { status: 400 }
      )
    }

    // Get page with classification
    const pageResult = await db.query(
      `
      SELECT
        wp.id,
        wp.url,
        wp.title,
        wp.content_preview,
        wp.web_source_id,
        ws.name AS source_name,
        ws.category AS source_category,
        lc.id AS classification_id,
        lc.primary_category,
        lc.domain,
        lc.document_nature,
        lc.confidence_score,
        lc.requires_validation,
        lc.review_priority,
        lc.review_estimated_effort,
        lc.validation_reason,
        lc.classification_source,
        lc.signals_used,
        lc.alternative_classifications,
        lc.context_boost,
        lc.created_at AS classified_at
      FROM web_pages wp
      LEFT JOIN web_sources ws ON ws.id = wp.web_source_id
      LEFT JOIN legal_classifications lc ON lc.web_page_id = wp.id
      WHERE wp.id = $1
      `,
      [pageId]
    )

    if (pageResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      )
    }

    const page = pageResult.rows[0]

    // If not classified yet
    if (!page.classification_id) {
      return NextResponse.json({
        page: {
          id: page.id,
          url: page.url,
          title: page.title,
          contentPreview: page.content_preview,
          sourceId: page.web_source_id,
          sourceName: page.source_name,
          sourceCategory: page.source_category,
        },
        classification: null,
      })
    }

    // Parse signals and alternatives (JSONB)
    const signalsUsed = page.signals_used || []
    const alternatives = page.alternative_classifications || []

    // Get structured metadata if available
    const metadataResult = await db.query(
      `
      SELECT
        decision_number,
        decision_date,
        tribunal_code,
        chambre_code,
        parties,
        solution,
        text_number,
        jort_reference,
        effective_date,
        ministry,
        author,
        publication_name,
        publication_date,
        keywords
      FROM kb_structured_metadata
      WHERE web_page_id = $1
      LIMIT 1
      `,
      [pageId]
    )

    const metadata = metadataResult.rows.length > 0 ? metadataResult.rows[0] : null

    // Get correction history
    const correctionsResult = await db.query(
      `
      SELECT
        id,
        original_category,
        original_domain,
        corrected_category,
        corrected_domain,
        corrected_document_type,
        corrected_by,
        has_generated_rule,
        created_at
      FROM classification_corrections
      WHERE web_page_id = $1
      ORDER BY created_at DESC
      LIMIT 5
      `,
      [pageId]
    )

    const corrections = correctionsResult.rows.map((row: any) => ({
      id: row.id,
      originalCategory: row.original_category,
      originalDomain: row.original_domain,
      correctedCategory: row.corrected_category,
      correctedDomain: row.corrected_domain,
      correctedDocumentType: row.corrected_document_type,
      correctedBy: row.corrected_by,
      hasGeneratedRule: row.has_generated_rule,
      createdAt: row.created_at,
    }))

    // Build response
    return NextResponse.json({
      page: {
        id: page.id,
        url: page.url,
        title: page.title,
        contentPreview: page.content_preview,
        sourceId: page.web_source_id,
        sourceName: page.source_name,
        sourceCategory: page.source_category,
      },
      classification: {
        id: page.classification_id,
        primaryCategory: page.primary_category,
        domain: page.domain,
        documentNature: page.document_nature,
        confidenceScore: parseFloat(page.confidence_score),
        requiresValidation: page.requires_validation,
        reviewPriority: page.review_priority,
        reviewEstimatedEffort: page.review_estimated_effort,
        validationReason: page.validation_reason,
        classificationSource: page.classification_source,
        signalsUsed: signalsUsed.map((signal: any) => ({
          source: signal.source,
          category: signal.category,
          domain: signal.domain,
          confidence: signal.confidence,
          reason: signal.reason,
        })),
        alternatives: alternatives.map((alt: any) => ({
          category: alt.category,
          domain: alt.domain,
          confidence: alt.confidence,
          source: alt.source,
        })),
        contextBoost: page.context_boost,
        classifiedAt: page.classified_at,
      },
      metadata: metadata
        ? {
            decisionNumber: metadata.decision_number,
            decisionDate: metadata.decision_date,
            tribunalCode: metadata.tribunal_code,
            chambreCode: metadata.chambre_code,
            parties: metadata.parties,
            solution: metadata.solution,
            textNumber: metadata.text_number,
            jortReference: metadata.jort_reference,
            effectiveDate: metadata.effective_date,
            ministry: metadata.ministry,
            author: metadata.author,
            publicationName: metadata.publication_name,
            publicationDate: metadata.publication_date,
            keywords: metadata.keywords,
          }
        : null,
      corrections,
    })
  } catch (error) {
    console.error('Error fetching page classification:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
