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
import { RAG_THRESHOLDS } from '@/lib/ai/config'
import { safeParseInt } from '@/lib/utils/safe-number'
import { recordPipelineMetric } from '@/lib/metrics/rag-metrics'

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
  offset?: number // Phase 4.3: Pagination offset
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
    const {
      query,
      filters = {},
      limit = 20,
      offset = 0, // Phase 4.3: Support pagination
      includeRelations = true,
      sortBy = 'relevance'
    } = body

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

    if (offset < 0) {
      return NextResponse.json(
        { success: false, error: 'Offset doit être >= 0' },
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

    // 4. Recherche RAG avec pagination (Phase 4.3)
    const results = await search(query, ragFilters, {
      limit,
      offset,
      includeRelations,
      userId: session.user.id, // Pour cache Redis
      threshold: RAG_THRESHOLDS.kbSearch, // Seuil bas (0.20) pour exploration KB
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

    // 6. Pagination (Phase 4.3: Implémentation complète)
    const total = sortedResults.length
    // hasMore = true si on a reçu exactement `limit` résultats (suggère plus de résultats disponibles)
    const hasMore = sortedResults.length === limit

    const processingTimeMs = Date.now() - startTime

    // Cache hit heuristique: Si offset=0, pas de filtres complexes et latence <50ms
    // Note: Pour info exacte, il faudrait modifier unified-rag-service pour retourner cacheHit
    const cacheHit = offset === 0 && processingTimeMs < 50

    // Instrumentation métriques comparatives pipeline
    const avgSim = sortedResults.length > 0
      ? sortedResults.reduce((s, r) => s + r.similarity, 0) / sortedResults.length
      : 0
    recordPipelineMetric({
      pipeline: 'kb_search',
      abstention: sortedResults.length === 0,
      cacheHit,
      sourcesCount: sortedResults.length,
      avgSimilarity: avgSim,
      latencyMs: processingTimeMs,
    })

    return NextResponse.json({
      success: true,
      results: sortedResults,
      pagination: {
        total,
        limit,
        offset,
        hasMore,
      },
      metadata: {
        processingTimeMs,
        cacheHit,
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
    const results = await search(query, { category }, { limit, threshold: RAG_THRESHOLDS.kbSearch })

    const processingTimeMs = Date.now() - startTime
    const cacheHit = processingTimeMs < 50
    const avgSim = results.length > 0
      ? results.reduce((s, r) => s + r.similarity, 0) / results.length
      : 0

    // Instrumentation métriques comparatives pipeline (GET)
    recordPipelineMetric({
      pipeline: 'kb_search',
      abstention: results.length === 0,
      cacheHit,
      sourcesCount: results.length,
      avgSimilarity: avgSim,
      latencyMs: processingTimeMs,
    })

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
        cacheHit,
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
