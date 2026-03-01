/**
 * GET /api/admin/pipeline/documents/[id]/chunks
 * Retourne les chunks d'un document KB avec statut embedding
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { safeParseInt } from '@/lib/utils/safe-number'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id } = await params

    const result = await db.query(
      `SELECT
        c.id,
        c.chunk_index,
        c.content,
        c.metadata,
        LENGTH(c.content) as content_length,
        (c.embedding IS NOT NULL) as has_embedding,
        (c.embedding_openai IS NOT NULL) as has_embedding_openai
      FROM knowledge_base_chunks c
      WHERE c.knowledge_base_id = $1
      ORDER BY c.chunk_index ASC`,
      [id]
    )

    const chunks = result.rows.map(row => ({
      id: row.id,
      chunk_index: row.chunk_index,
      content: row.content,
      metadata: row.metadata,
      content_length: parseInt(row.content_length, 10),
      has_embedding: row.has_embedding,
      has_embedding_openai: row.has_embedding_openai,
    }))

    const embeddingStats = {
      total: chunks.length,
      with_ollama: chunks.filter(c => c.has_embedding).length,
      with_openai: chunks.filter(c => c.has_embedding_openai).length,
      without_embedding: chunks.filter(c => !c.has_embedding && !c.has_embedding_openai).length,
    }

    return NextResponse.json({ chunks, stats: embeddingStats })
  } catch (error) {
    console.error('[Pipeline API] Erreur chunks document:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
