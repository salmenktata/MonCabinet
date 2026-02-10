/**
 * API Route: Administration - Knowledge Base Document par ID
 *
 * GET /api/admin/knowledge-base/[id]
 * - Récupère les détails d'un document
 *
 * PATCH /api/admin/knowledge-base/[id]
 * - Met à jour un document
 *
 * DELETE /api/admin/knowledge-base/[id]
 * - Supprime un document
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  getKnowledgeDocument,
  updateKnowledgeDocument,
  deleteKnowledgeDocument,
  type KnowledgeBaseCategory,
} from '@/lib/ai/knowledge-base-service'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return result.rows[0]?.role === 'admin'
}

// =============================================================================
// GET: Détails d'un document
// =============================================================================

export async function GET(
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

    const { id } = await params
    const document = await getKnowledgeDocument(id)

    if (!document) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Récupérer aussi les chunks pour plus de détails
    const chunksResult = await db.query(
      `SELECT id, chunk_index, LENGTH(content) as content_length, metadata
       FROM knowledge_base_chunks
       WHERE knowledge_base_id = $1
       ORDER BY chunk_index ASC`,
      [id]
    )

    return NextResponse.json({
      document,
      chunks: chunksResult.rows.map((row) => ({
        id: row.id,
        index: row.chunk_index,
        contentLength: parseInt(row.content_length),
        metadata: row.metadata,
      })),
    })
  } catch (error) {
    console.error('Erreur récupération document:', error)
    return NextResponse.json(
      { error: 'Erreur récupération document' },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH: Mettre à jour un document
// =============================================================================

export async function PATCH(
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

    const { id } = await params
    const body = await request.json()

    const { title, description, category, metadata } = body

    // Validation catégorie si fournie
    if (category) {
      const validCategories = getCategoriesForContext('knowledge_base', 'fr')
        .filter(c => c.value !== 'all')
        .map(c => c.value as KnowledgeBaseCategory)

      if (!validCategories.includes(category)) {
        return NextResponse.json(
          { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const document = await updateKnowledgeDocument(id, {
      title,
      description,
      category,
      metadata,
    })

    if (!document) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    return NextResponse.json({
      message: 'Document mis à jour',
      document,
    })
  } catch (error) {
    console.error('Erreur mise à jour document:', error)
    return NextResponse.json(
      { error: 'Erreur mise à jour document' },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE: Supprimer un document
// =============================================================================

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
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { id } = await params
    const deleted = await deleteKnowledgeDocument(id)

    if (!deleted) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    return NextResponse.json({
      message: 'Document supprimé avec succès',
    })
  } catch (error) {
    console.error('Erreur suppression document:', error)
    return NextResponse.json(
      { error: 'Erreur suppression document' },
      { status: 500 }
    )
  }
}
