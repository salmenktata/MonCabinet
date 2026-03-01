/**
 * API Route - Recherche de chunks KB pour le sélecteur Gold Dataset
 *
 * GET /api/admin/eval/gold/chunks?search=X&limit=20
 * GET /api/admin/eval/gold/chunks?ids=uuid1,uuid2   → Résoudre des UUIDs en aperçu
 *
 * @module app/api/admin/eval/gold/chunks/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'

interface ChunkPreview {
  id: string
  documentTitle: string
  documentId: string
  contentSnippet: string
  category: string | null
  domain: string | null
}

export const GET = withAdminApiAuth(async (request: NextRequest) => {
  const { searchParams } = request.nextUrl
  const search = searchParams.get('search')?.trim()
  const idsParam = searchParams.get('ids')
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)

  // Mode résolution d'IDs (pour afficher les chips des goldChunkIds existants)
  if (idsParam) {
    const ids = idsParam.split(',').filter(Boolean).slice(0, 50)
    if (ids.length === 0) return NextResponse.json([])

    const res1 = await db.query<{
      id: string
      document_title: string
      document_id: string
      content_snippet: string
      category: string | null
    }>(
      `SELECT
        kbc.id,
        kb.title AS document_title,
        kb.id AS document_id,
        LEFT(kbc.content, 200) AS content_snippet,
        kb.category
       FROM knowledge_base_chunks kbc
       JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
       WHERE kbc.id = ANY($1::uuid[])
         AND kb.is_indexed = true`,
      [ids]
    )

    return NextResponse.json(res1.rows.map(mapRow))
  }

  // Mode recherche textuelle
  if (!search || search.length < 2) {
    return NextResponse.json({ error: 'Paramètre search requis (min 2 caractères)' }, { status: 400 })
  }

  const res2 = await db.query<{
    id: string
    document_title: string
    document_id: string
    content_snippet: string
    category: string | null
  }>(
    `SELECT
      kbc.id,
      kb.title AS document_title,
      kb.id AS document_id,
      LEFT(kbc.content, 200) AS content_snippet,
      kb.category
     FROM knowledge_base_chunks kbc
     JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
     WHERE kb.is_indexed = true
       AND (
         kbc.content ILIKE $1
         OR kb.title ILIKE $1
       )
     ORDER BY kb.title, kbc.chunk_index
     LIMIT $2`,
    [`%${search}%`, limit]
  )

  return NextResponse.json(res2.rows.map(mapRow))
})

function mapRow(row: {
  id: string
  document_title: string
  document_id: string
  content_snippet: string
  category: string | null
}): ChunkPreview {
  return {
    id: row.id,
    documentTitle: row.document_title,
    documentId: row.document_id,
    contentSnippet: row.content_snippet,
    category: row.category,
    domain: null,
  }
}
