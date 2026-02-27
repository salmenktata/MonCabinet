/**
 * API Route: Approbation document juridique
 *
 * POST /api/admin/legal-documents/[id]/approve
 *   - Approuve le document pour publication publique et indexation RAG
 *
 * DELETE /api/admin/legal-documents/[id]/approve
 *   - Révoque l'approbation
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { approveDocument, revokeApproval, getDocumentById } from '@/lib/legal-documents/document-service'
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

export const dynamic = 'force-dynamic'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

/**
 * POST: Approuver le document + déclencher indexation RAG
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

    // Vérifier que le document existe et est consolidé
    const doc = await getDocumentById(id)
    if (!doc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    if (doc.consolidationStatus !== 'complete') {
      return NextResponse.json(
        { error: 'Le document doit être consolidé avant approbation' },
        { status: 400 }
      )
    }

    // Approuver
    await approveDocument(id, session.user.id)

    // Restaurer la visibilité KB si elle avait été révoquée précédemment
    if (doc.knowledgeBaseId) {
      await db.query(
        `UPDATE knowledge_base SET is_active = true, updated_at = NOW() WHERE id = $1`,
        [doc.knowledgeBaseId]
      )
    }

    // Déclencher indexation RAG automatiquement après approbation
    let indexingResult = null
    try {
      indexingResult = await indexLegalDocument(id)
    } catch (indexError) {
      console.error(`[Approval] Erreur indexation après approbation:`, indexError)
    }

    return NextResponse.json({
      success: true,
      message: `Document ${doc.citationKey} approuvé`,
      indexing: indexingResult
        ? { success: indexingResult.success, chunksCreated: indexingResult.chunksCreated }
        : null,
    })
  } catch (error) {
    console.error('[API] Erreur approbation:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}

/**
 * DELETE: Révoquer l'approbation
 */
export async function DELETE(
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

    const doc = await getDocumentById(id)
    if (!doc) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    await revokeApproval(id)

    // Masquer l'entrée KB liée côté client
    if (doc.knowledgeBaseId) {
      await db.query(
        `UPDATE knowledge_base SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [doc.knowledgeBaseId]
      )
    }

    return NextResponse.json({
      success: true,
      message: `Approbation révoquée pour ${doc.citationKey}`,
    })
  } catch (error) {
    console.error('[API] Erreur révocation:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
