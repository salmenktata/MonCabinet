/**
 * API Route: Réindexation forcée d'un document juridique
 *
 * POST /api/admin/legal-documents/[id]/reindex
 *   - Re-chunke et re-embeds un document approuvé sans changer son statut d'approbation
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

/**
 * POST: Réindexer un document juridique (force re-chunking + re-embedding)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id } = await params

    const docResult = await db.query(
      `SELECT id, citation_key, is_approved, consolidation_status
       FROM legal_documents WHERE id = $1`,
      [id]
    )

    if (docResult.rows.length === 0) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    const doc = docResult.rows[0]

    if (!doc.is_approved) {
      return NextResponse.json(
        { error: 'Le document doit être approuvé avant réindexation' },
        { status: 400 }
      )
    }

    if (doc.consolidation_status !== 'complete') {
      return NextResponse.json(
        { error: 'La consolidation doit être complète avant réindexation' },
        { status: 400 }
      )
    }

    const result = await indexLegalDocument(id)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Erreur lors de la réindexation', documentId: id },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      documentId: id,
      chunksCreated: result.chunksCreated,
      message: `Document ${doc.citation_key} réindexé — ${result.chunksCreated} chunk(s) créé(s)`,
    })
  } catch (error) {
    console.error('[API] Erreur réindexation:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
