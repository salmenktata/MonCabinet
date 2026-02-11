/**
 * API Endpoint : /api/client/kb/search
 *
 * Recherche sémantique dans la base de connaissances juridique
 * avec filtres avancés et métadonnées enrichies.
 *
 * Sprint 4 - Fonctionnalités Client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { search } from '@/lib/ai/unified-rag-service'
import type { RAGSearchFilters, RAGSearchResult } from '@/lib/ai/unified-rag-service'

// =============================================================================
// TYPES
// =============================================================================

interface KBSearchRequest {
  query: string
  filters?: {
    category?: string
    domain?: string
    tribunal?: string
    chambre?: string
    language?: 'fr' | 'ar' | 'bi'
    dateFrom?: string // ISO date
    dateTo?: string // ISO date
  }
  limit?: number
  includeRelations?: boolean // Inclure relations juridiques (citations, supersedes)
  sortBy?: 'relevance' | 'date' | 'citations'
}

interface KBSearchResponse {
  success: boolean
  results?: RAGSearchResult[]
  pagination?: {
    total: number
    limit: number
    hasMore: boolean
  }
  error?: string
  metadata?: {
    processingTimeMs: number
    cacheHit: boolean
  }
}

// =============================================================================
// HANDLER POST
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse<KBSearchResponse>> {
  const startTime = Date.now()

  try {
    // 1. Authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    // 2. Validation requête
    const body = (await req.json()) as KBSearchRequest
    const { query, filters = {}, limit = 20, includeRelations = true, sortBy = 'relevance' } = body

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Query requise' },
        { status: 400 }
      )
    }

    if (query.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Query trop longue (max 500 caractères)' },
        { status: 400 }
      )
    }

    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { success: false, error: 'Limit doit être entre 1 et 100' },
        { status: 400 }
      )
    }

    // 3. Construction filtres RAG
    const ragFilters: RAGSearchFilters = {
      category: filters.category,
      domain: filters.domain,
      language: filters.language,
      tribunal: filters.tribunal,
      chambre: filters.chambre,
      dateRange: (filters.dateFrom || filters.dateTo) ? {
        from: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        to: filters.dateTo ? new Date(filters.dateTo) : undefined,
      } : undefined,
    }

    // 4. Recherche RAG
    const results = await search(query, ragFilters, {
      limit,
      includeRelations,
    })

    // 5. Tri si nécessaire
    let sortedResults = [...results]

    if (sortBy === 'date') {
      sortedResults.sort((a, b) => {
        const dateA = a.metadata.decisionDate?.getTime() || 0
        const dateB = b.metadata.decisionDate?.getTime() || 0
        return dateB - dateA
      })
    } else if (sortBy === 'citations') {
      sortedResults.sort((a, b) => {
        const citationsA = a.metadata.citedByCount || 0
        const citationsB = b.metadata.citedByCount || 0
        return citationsB - citationsA
      })
    }
    // 'relevance' est déjà le tri par défaut (par similarity)

    // 6. Pagination
    const total = sortedResults.length
    const hasMore = false // TODO: Implémenter pagination vraie avec offset

    const processingTimeMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      results: sortedResults,
      pagination: {
        total,
        limit,
        hasMore,
      },
      metadata: {
        processingTimeMs,
        cacheHit: false, // TODO: Récupérer info cache depuis unified-rag-service
      },
    })
  } catch (error) {
    console.error('[API KB Search] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// HANDLER GET (pour quick search sans filtres)
// =============================================================================

export async function GET(req: NextRequest): Promise<NextResponse<KBSearchResponse>> {
  const startTime = Date.now()

  try {
    // 1. Authentification
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      )
    }

    // 2. Query params
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')
    const limit = parseInt(searchParams.get('limit') || '20', 10)
    const category = searchParams.get('category') || undefined

    if (!query) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "q" requise' },
        { status: 400 }
      )
    }

    // 3. Recherche simple
    const results = await search(query, { category }, { limit })

    const processingTimeMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      results,
      pagination: {
        total: results.length,
        limit,
        hasMore: false,
      },
      metadata: {
        processingTimeMs,
        cacheHit: false,
      },
    })
  } catch (error) {
    console.error('[API KB Search GET] Error:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur serveur',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// HANDLER OPTIONS (CORS)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
