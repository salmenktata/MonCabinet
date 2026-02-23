import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

interface BrowseRow {
  id: string
  title: string
  category: string
  created_at: string
  doc_type: string | null
  norm_level: string | null
}

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const category = searchParams.get('category')
  const normLevel = searchParams.get('norm_level')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
  const offset = parseInt(searchParams.get('offset') || '0', 10)
  const sort = searchParams.get('sort') || 'date'

  if (!category && !normLevel) {
    return NextResponse.json({ error: 'Le paramètre category ou norm_level est requis' }, { status: 400 })
  }

  const orderBy = sort === 'title' ? 'kb.title ASC' : 'kb.created_at DESC'

  // Construire les filtres dynamiques
  const whereParams: unknown[] = []
  const whereClauses: string[] = ['kb.is_indexed = true', 'kb.is_active = true']

  if (category) {
    whereParams.push(category)
    whereClauses.push(`kb.category = $${whereParams.length}`)
  }
  if (normLevel) {
    whereParams.push(normLevel)
    whereClauses.push(`kb.norm_level = $${whereParams.length}::norm_level`)
  }

  const whereSQL = whereClauses.join(' AND ')

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM knowledge_base kb WHERE ${whereSQL}`,
    whereParams
  )
  const total = parseInt(countResult.rows[0]?.count || '0', 10)

  // Fetch documents
  const docsResult = await query<BrowseRow>(
    `SELECT kb.id, kb.title, kb.category, kb.created_at, kb.doc_type, kb.norm_level::text as norm_level
     FROM knowledge_base kb
     WHERE ${whereSQL}
     ORDER BY ${orderBy}
     LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`,
    [...whereParams, limit, offset]
  )

  // Enrich with metadata (tribunal, citations, etc.)
  const kbIds = docsResult.rows.map((r) => r.id)

  let metadataMap = new Map<string, Record<string, unknown>>()
  if (kbIds.length > 0) {
    const metaResult = await query<{
      knowledge_base_id: string
      tribunal_code: string | null
      tribunal_label_ar: string | null
      tribunal_label_fr: string | null
      chambre_code: string | null
      chambre_label_ar: string | null
      chambre_label_fr: string | null
      decision_date: string | null
      decision_number: string | null
      legal_basis: string[] | null
      extraction_confidence: number | null
      cites_count: string
      cited_by_count: string
    }>(
      `SELECT
        meta.knowledge_base_id,
        meta.tribunal_code,
        trib_tax.label_ar AS tribunal_label_ar,
        trib_tax.label_fr AS tribunal_label_fr,
        meta.chambre_code,
        chambre_tax.label_ar AS chambre_label_ar,
        chambre_tax.label_fr AS chambre_label_fr,
        meta.decision_date,
        meta.decision_number,
        meta.legal_basis,
        meta.extraction_confidence,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE source_kb_id = meta.knowledge_base_id AND validated = true)::text AS cites_count,
        (SELECT COUNT(*) FROM kb_legal_relations WHERE target_kb_id = meta.knowledge_base_id AND validated = true)::text AS cited_by_count
      FROM kb_structured_metadata meta
      LEFT JOIN legal_taxonomy trib_tax ON meta.tribunal_code = trib_tax.code
      LEFT JOIN legal_taxonomy chambre_tax ON meta.chambre_code = chambre_tax.code
      WHERE meta.knowledge_base_id = ANY($1)`,
      [kbIds]
    )

    for (const row of metaResult.rows) {
      metadataMap.set(row.knowledge_base_id, {
        tribunalCode: row.tribunal_code,
        tribunalLabelAr: row.tribunal_label_ar,
        tribunalLabelFr: row.tribunal_label_fr,
        chambreCode: row.chambre_code,
        chambreLabelAr: row.chambre_label_ar,
        chambreLabelFr: row.chambre_label_fr,
        decisionDate: row.decision_date,
        decisionNumber: row.decision_number,
        legalBasis: row.legal_basis,
        extractionConfidence: row.extraction_confidence,
        citesCount: parseInt(row.cites_count || '0', 10),
        citedByCount: parseInt(row.cited_by_count || '0', 10),
      })
    }
  }

  const results = docsResult.rows.map((row) => ({
    kbId: row.id,
    title: row.title,
    category: row.category,
    normLevel: row.norm_level,
    similarity: null,
    metadata: metadataMap.get(row.id) || {},
  }))

  return NextResponse.json(
    {
      success: true,
      results,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    },
    { headers: { 'Cache-Control': 's-maxage=120, stale-while-revalidate=60' } }
  )
}
