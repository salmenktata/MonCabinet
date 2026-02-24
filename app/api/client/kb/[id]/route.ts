import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

interface KBRow {
  id: string
  title: string
  category: string
  doc_type: string | null
  norm_level: string | null
  updated_at: string
  metadata: Record<string, unknown> | null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { id } = await params

  const result = await query<KBRow>(
    `SELECT id, title, category, doc_type, norm_level, updated_at, metadata
     FROM knowledge_base
     WHERE id = $1 AND is_indexed = true AND is_active = true`,
    [id]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  const row = result.rows[0]
  return NextResponse.json({
    kbId: row.id,
    title: row.title,
    category: row.category,
    docType: row.doc_type,
    normLevel: row.norm_level,
    updatedAt: row.updated_at,
    metadata: row.metadata || {},
    similarity: null,
  })
}
