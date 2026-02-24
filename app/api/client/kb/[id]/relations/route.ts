import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

/**
 * GET /api/client/kb/[id]/relations
 *
 * Retourne les relations juridiques d'un document KB (cites, citedBy, supersedes…).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { id } = await params

  try {
    const result = await query(
      `
      -- Relations sortantes
      SELECT
        'outgoing' AS direction,
        r.relation_type,
        r.target_kb_id AS related_kb_id,
        kb_t.title AS related_title,
        kb_t.category AS related_category,
        r.context,
        r.confidence
      FROM kb_legal_relations r
      JOIN knowledge_base kb_t ON r.target_kb_id = kb_t.id
      WHERE r.source_kb_id = $1 AND r.validated = true

      UNION ALL

      -- Relations entrantes
      SELECT
        'incoming' AS direction,
        r.relation_type,
        r.source_kb_id AS related_kb_id,
        kb_s.title AS related_title,
        kb_s.category AS related_category,
        r.context,
        r.confidence
      FROM kb_legal_relations r
      JOIN knowledge_base kb_s ON r.source_kb_id = kb_s.id
      WHERE r.target_kb_id = $1 AND r.validated = true

      ORDER BY confidence DESC NULLS LAST
      LIMIT 100
      `,
      [id]
    )

    const relations = {
      cites: [] as object[],
      citedBy: [] as object[],
      supersedes: [] as object[],
      supersededBy: [] as object[],
      relatedCases: [] as object[],
    }

    for (const row of result.rows) {
      const rel = {
        relationType: row.relation_type,
        relatedKbId: row.related_kb_id,
        relatedTitle: row.related_title,
        relatedCategory: row.related_category,
        context: row.context,
        confidence: row.confidence,
        direction: row.direction,
      }

      if (row.relation_type === 'cites' && row.direction === 'outgoing') {
        relations.cites.push(rel)
      } else if (row.relation_type === 'cites' && row.direction === 'incoming') {
        relations.citedBy.push(rel)
      } else if (row.relation_type === 'supersedes' && row.direction === 'outgoing') {
        relations.supersedes.push(rel)
      } else if (row.relation_type === 'supersedes' && row.direction === 'incoming') {
        relations.supersededBy.push(rel)
      } else if (row.relation_type === 'related_case') {
        relations.relatedCases.push(rel)
      }
    }

    return NextResponse.json(relations, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch (error) {
    console.error('[KB Relations API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
