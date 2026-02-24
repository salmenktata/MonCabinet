import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { query } from '@/lib/db/postgres'

interface ChunkRow {
  chunk_index: number
  content: string
  metadata: Record<string, unknown> | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const { id } = await params

  // Vérifier que le document existe et est indexé/actif
  const docCheck = await query<{ id: string; title: string }>(
    `SELECT id, title FROM knowledge_base WHERE id = $1 AND is_indexed = true AND is_active = true`,
    [id]
  )

  if (docCheck.rows.length === 0) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 })
  }

  // Récupérer les chunks ordonnés
  const chunksResult = await query<ChunkRow>(
    `SELECT chunk_index, content, metadata
     FROM knowledge_base_chunks
     WHERE knowledge_base_id = $1
     ORDER BY chunk_index ASC`,
    [id]
  )

  const chunks = chunksResult.rows.map((row) => ({
    index: row.chunk_index,
    content: row.content,
    metadata: row.metadata || {},
  }))

  return NextResponse.json(
    {
      success: true,
      documentId: id,
      title: docCheck.rows[0].title,
      chunks,
      total: chunks.length,
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
