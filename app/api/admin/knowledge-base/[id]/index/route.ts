/**
 * API Route: Administration - Indexer un document de la base de connaissances
 *
 * POST /api/admin/knowledge-base/[id]/index
 * - Déclenche l'indexation (chunking + embeddings) d'un document
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { indexKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { isSemanticSearchEnabled } from '@/lib/ai/config'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

// =============================================================================
// POST: Indexer un document
// =============================================================================

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
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    if (!isSemanticSearchEnabled()) {
      return NextResponse.json(
        { error: 'Service de recherche sémantique désactivé (OPENAI_API_KEY manquant)' },
        { status: 503 }
      )
    }

    const { id } = await params

    // Vérifier que le document existe
    const docResult = await db.query(
      'SELECT id, title, is_indexed FROM knowledge_base WHERE id = $1',
      [id]
    )

    if (docResult.rows.length === 0) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    const doc = docResult.rows[0]

    // Indexer le document
    const result = await indexKnowledgeDocument(id)

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Erreur indexation',
          documentId: id,
          documentTitle: doc.title,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Document indexé avec succès',
      documentId: id,
      documentTitle: doc.title,
      chunksCreated: result.chunksCreated,
      wasAlreadyIndexed: doc.is_indexed,
    })
  } catch (error) {
    console.error('Erreur indexation document:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erreur indexation document',
      },
      { status: 500 }
    )
  }
}
