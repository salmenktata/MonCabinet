/**
 * API Route: Documents similaires de la base de connaissances
 *
 * GET /api/admin/knowledge-base/{id}/related
 * - Récupère les documents KB similaires à un document donné
 * - Paramètres query: limit (défaut: 5), threshold (défaut: 0.6)
 * - Cache Redis 24h pour les résultats
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { findRelatedDocuments } from '@/lib/ai/related-documents-service'
import { getKnowledgeDocument } from '@/lib/ai/knowledge-base-service'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Vérifier authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier rôle admin/super-admin
    const userRole = session.user.role as string
    if (!['admin', 'super_admin'].includes(userRole)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const { id: documentId } = await params

    // Vérifier que le document existe
    const document = await getKnowledgeDocument(documentId)
    if (!document) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    // Parser les paramètres de requête
    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 20)
    const threshold = Math.max(0.3, Math.min(0.95, parseFloat(searchParams.get('threshold') || '0.6')))

    // Récupérer les documents similaires
    const relatedDocuments = await findRelatedDocuments(documentId, {
      limit,
      threshold,
    })

    return NextResponse.json({
      documentId,
      documentTitle: document.title,
      related: relatedDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        category: doc.category,
        subcategory: doc.subcategory,
        language: doc.language,
        similarity: Math.round(doc.similarity * 100),
        chunkCount: doc.chunkCount,
        tags: doc.tags,
      })),
      count: relatedDocuments.length,
    })
  } catch (error) {
    console.error('Erreur récupération documents similaires:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des documents similaires' },
      { status: 500 }
    )
  }
}
