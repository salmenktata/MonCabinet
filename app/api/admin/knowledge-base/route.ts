/**
 * API Route: Administration - Base de Connaissances
 *
 * GET /api/admin/knowledge-base
 * - Liste les documents de la base de connaissances
 * - Paramètres: category, isIndexed, search, limit, offset
 * Cache: 5 minutes (données semi-statiques)
 *
 * POST /api/admin/knowledge-base
 * - Ajoute un nouveau document à la base de connaissances
 * - Accepte multipart/form-data ou JSON
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering - pas de prérendu statique
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import {
  uploadKnowledgeDocument,
  listKnowledgeDocuments,
  getKnowledgeBaseStats,
  type KnowledgeBaseCategory,
} from '@/lib/ai/knowledge-base-service'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return result.rows[0]?.role === 'admin'
}

// =============================================================================
// GET: Liste des documents
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier accès admin
    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') as KnowledgeBaseCategory | null
    const isIndexedParam = searchParams.get('isIndexed')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeStats = searchParams.get('includeStats') === 'true'

    // Liste des documents
    const { documents, total } = await listKnowledgeDocuments({
      category: category || undefined,
      isIndexed: isIndexedParam ? isIndexedParam === 'true' : undefined,
      search: search || undefined,
      limit,
      offset,
    })

    // Statistiques optionnelles
    let stats = null
    if (includeStats) {
      stats = await getKnowledgeBaseStats()
    }

    return NextResponse.json({
      documents,
      total,
      pagination: {
        limit,
        offset,
        hasMore: offset + documents.length < total,
      },
      ...(stats ? { stats } : {}),
    }, {
      headers: getCacheHeaders(CACHE_PRESETS.MEDIUM) // Cache 5 minutes
    })
  } catch (error) {
    console.error('Erreur liste knowledge base:', error)
    return NextResponse.json(
      { error: 'Erreur récupération documents' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Ajouter un document
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier accès admin
    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const contentType = request.headers.get('content-type') || ''

    let category: KnowledgeBaseCategory
    let language: 'ar' | 'fr' = 'fr'
    let title: string
    let description: string | undefined
    let metadata: Record<string, unknown> = {}
    let file: { buffer: Buffer; filename: string; mimeType: string } | undefined
    let text: string | undefined
    let autoIndex = true

    if (contentType.includes('multipart/form-data')) {
      // Upload de fichier
      const formData = await request.formData()

      category = formData.get('category') as KnowledgeBaseCategory
      language = (formData.get('language') as 'ar' | 'fr') || 'fr'
      title = formData.get('title') as string
      description = formData.get('description') as string | undefined
      autoIndex = formData.get('autoIndex') !== 'false'

      const metadataStr = formData.get('metadata') as string | null
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr)
        } catch {
          // Ignorer erreur parsing
        }
      }

      const uploadedFile = formData.get('file') as File | null
      if (uploadedFile) {
        const buffer = Buffer.from(await uploadedFile.arrayBuffer())
        file = {
          buffer,
          filename: uploadedFile.name,
          mimeType: uploadedFile.type,
        }
      }

      text = formData.get('text') as string | undefined
    } else {
      // JSON body
      const body = await request.json()
      category = body.category
      language = body.language || 'fr'
      title = body.title
      description = body.description
      metadata = body.metadata || {}
      text = body.text
      autoIndex = body.autoIndex !== false
    }

    // Validation
    if (!category || !title) {
      return NextResponse.json(
        { error: 'Catégorie et titre requis' },
        { status: 400 }
      )
    }

    const validCategories = getCategoriesForContext('knowledge_base', 'fr')
      .filter(c => c.value !== 'all')
      .map(c => c.value as KnowledgeBaseCategory)

    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Catégorie invalide. Valeurs acceptées: ${validCategories.join(', ')}` },
        { status: 400 }
      )
    }

    if (!file && !text) {
      return NextResponse.json(
        { error: 'Un fichier ou un texte est requis' },
        { status: 400 }
      )
    }

    // Upload du document
    const document = await uploadKnowledgeDocument(
      {
        category,
        language,
        title,
        description,
        metadata,
        file,
        text,
        autoIndex,
      },
      session.user.id
    )

    return NextResponse.json(
      {
        message: 'Document ajouté avec succès',
        document,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Erreur upload knowledge base:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erreur ajout document',
      },
      { status: 500 }
    )
  }
}
