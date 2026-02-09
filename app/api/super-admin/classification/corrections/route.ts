/**
 * API: Classification Corrections
 *
 * GET /api/super-admin/classification/corrections
 * - Récupère l'historique des corrections avec impact (règle générée ou non)
 *
 * POST /api/super-admin/classification/corrections
 * - Enregistre une nouvelle correction de classification
 *
 * Query params (GET) :
 * - limit : Nombre de résultats (défaut: 50, max: 200)
 * - offset : Pagination (défaut: 0)
 * - sourceId : Filtrer par source
 * - hasRule : Filtrer si correction a généré une règle (true/false)
 *
 * Body (POST) :
 * {
 *   pageId: string,
 *   correctedCategory: string,
 *   correctedDomain?: string,
 *   correctedDocumentType?: string,
 *   correctedBy: string,
 *   feedback?: { isUseful: boolean, notes?: string }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { recordClassificationCorrection } from '@/lib/web-scraper/classification-learning-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// =============================================================================
// TYPES
// =============================================================================

interface CorrectionHistoryItem {
  id: string
  pageId: string
  pageUrl: string
  pageTitle: string | null
  sourceName: string
  originalCategory: string
  originalDomain: string
  correctedCategory: string
  correctedDomain: string | null
  correctedDocumentType: string | null
  correctedBy: string
  createdAt: string
  hasGeneratedRule: boolean
  ruleId: string | null
  ruleName: string | null
  pagesAffected: number | null
}

interface CorrectionRequest {
  pageId: string
  correctedCategory: string
  correctedDomain?: string | null
  correctedDocumentType?: string | null
  correctedBy: string
  feedback?: {
    isUseful: boolean
    notes?: string
  }
}

// =============================================================================
// GET HANDLER - Historique corrections
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const sourceId = searchParams.get('sourceId') || null
    const hasRuleStr = searchParams.get('hasRule') // "true", "false", ou null

    let hasRuleFilter = ''
    if (hasRuleStr === 'true') {
      hasRuleFilter = 'AND cc.generated_rule_id IS NOT NULL'
    } else if (hasRuleStr === 'false') {
      hasRuleFilter = 'AND cc.generated_rule_id IS NULL'
    }

    const sourceFilter = sourceId ? 'AND wp.web_source_id = $3' : ''
    const params = sourceId ? [limit, offset, sourceId] : [limit, offset]

    const result = await db.query<{
      id: string
      page_id: string
      page_url: string
      page_title: string | null
      source_name: string
      original_category: string
      original_domain: string
      corrected_category: string
      corrected_domain: string | null
      corrected_document_type: string | null
      corrected_by: string
      created_at: string
      generated_rule_id: string | null
      rule_name: string | null
      pages_affected: string | null
    }>(
      `SELECT
        cc.id,
        cc.web_page_id as page_id,
        wp.url as page_url,
        wp.title as page_title,
        ws.name as source_name,
        lc.primary_category as original_category,
        lc.domain as original_domain,
        cc.corrected_category,
        cc.corrected_domain,
        cc.corrected_document_type,
        cc.corrected_by,
        cc.created_at,
        cc.generated_rule_id,
        cr.name as rule_name,
        cr.times_matched as pages_affected
      FROM classification_corrections cc
      JOIN web_pages wp ON cc.web_page_id = wp.id
      JOIN web_sources ws ON wp.web_source_id = ws.id
      JOIN legal_classifications lc ON lc.web_page_id = wp.id
      LEFT JOIN classification_rules cr ON cc.generated_rule_id = cr.id
      WHERE 1=1
        ${hasRuleFilter}
        ${sourceFilter}
      ORDER BY cc.created_at DESC
      LIMIT $1 OFFSET $2`,
      params
    )

    const items: CorrectionHistoryItem[] = result.rows.map(row => ({
      id: row.id,
      pageId: row.page_id,
      pageUrl: row.page_url,
      pageTitle: row.page_title,
      sourceName: row.source_name,
      originalCategory: row.original_category,
      originalDomain: row.original_domain,
      correctedCategory: row.corrected_category,
      correctedDomain: row.corrected_domain,
      correctedDocumentType: row.corrected_document_type,
      correctedBy: row.corrected_by,
      createdAt: row.created_at,
      hasGeneratedRule: row.generated_rule_id !== null,
      ruleId: row.generated_rule_id,
      ruleName: row.rule_name,
      pagesAffected: row.pages_affected ? parseInt(row.pages_affected) : null,
    }))

    // Récupérer total pour pagination
    const countResult = await db.query<{ total: string }>(
      `SELECT COUNT(*) as total
      FROM classification_corrections cc
      JOIN web_pages wp ON cc.web_page_id = wp.id
      WHERE 1=1
        ${hasRuleFilter}
        ${sourceFilter}`,
      sourceId ? [sourceId] : []
    )

    const total = parseInt(countResult.rows[0].total)

    return NextResponse.json({ items, total })
  } catch (error) {
    console.error('[Classification Corrections API GET] Error:', error)
    return NextResponse.json(
      {
        error: 'Erreur lors de la récupération des corrections',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST HANDLER - Enregistrer correction
// =============================================================================

export async function POST(req: NextRequest) {
  try {
    const body: CorrectionRequest = await req.json()

    // Validation
    if (!body.pageId || !body.correctedCategory || !body.correctedBy) {
      return NextResponse.json(
        { error: 'Champs requis manquants : pageId, correctedCategory, correctedBy' },
        { status: 400 }
      )
    }

    // Enregistrer la correction via le service de learning
    const correctionId = await recordClassificationCorrection(
      body.pageId,
      body.correctedBy,
      {
        category: body.correctedCategory,
        domain: body.correctedDomain || undefined,
        documentType: body.correctedDocumentType || undefined,
      }
    )

    // Enregistrer feedback si fourni
    if (body.feedback) {
      await db.query(
        `INSERT INTO classification_feedback
          (correction_id, is_useful, notes, created_by, created_at)
        VALUES ($1, $2, $3, $4, NOW())`,
        [
          correctionId,
          body.feedback.isUseful,
          body.feedback.notes || null,
          body.correctedBy,
        ]
      )
    }

    // Récupérer la correction créée avec ses détails
    const result = await db.query<{
      id: string
      page_url: string
      generated_rule_id: string | null
    }>(
      `SELECT
        cc.id,
        wp.url as page_url,
        cc.generated_rule_id
      FROM classification_corrections cc
      JOIN web_pages wp ON cc.web_page_id = wp.id
      WHERE cc.id = $1`,
      [correctionId]
    )

    const correction = result.rows[0]

    return NextResponse.json({
      success: true,
      correctionId: correction.id,
      hasGeneratedRule: correction.generated_rule_id !== null,
      message: correction.generated_rule_id
        ? 'Correction enregistrée et règle auto-générée'
        : 'Correction enregistrée',
    })
  } catch (error) {
    console.error('[Classification Corrections API POST] Error:', error)
    return NextResponse.json(
      {
        error: 'Erreur lors de l\'enregistrement de la correction',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
