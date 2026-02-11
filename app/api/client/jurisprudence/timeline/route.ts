/**
 * API Endpoint : /api/client/jurisprudence/timeline
 *
 * Génère une timeline interactive de l'évolution de la jurisprudence tunisienne
 * avec détection des revirements, confirmations et distinctions.
 *
 * Sprint 4 - Fonctionnalités Client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { buildJurisprudenceTimeline } from '@/lib/ai/jurisprudence-timeline-service'
import type {
  TimelineEvent,
  TimelineStats,
  TimelineFilters as ServiceFilters,
} from '@/lib/ai/jurisprudence-timeline-service'

// =============================================================================
// TYPES
// =============================================================================

interface TimelineRequest {
  filters?: {
    domain?: string // Domaine juridique (civil, commercial, penal, etc.)
    tribunalCode?: string // Code tribunal (TRIBUNAL_CASSATION, TRIBUNAL_APPEL, etc.)
    chambreCode?: string // Code chambre
    eventType?: 'major_shift' | 'confirmation' | 'nuance' | 'standard'
    dateFrom?: string // ISO date
    dateTo?: string // ISO date
  }
  limit?: number // Nombre max d'événements (défaut: 100)
  includeStats?: boolean // Inclure statistiques globales
}

interface TimelineResponse {
  success: boolean
  events?: TimelineEvent[]
  stats?: TimelineStats
  error?: string
  metadata?: {
    processingTimeMs: number
    eventsGenerated: number
    dateRange: {
      earliest: string | null
      latest: string | null
    }
  }
}

// =============================================================================
// HANDLER POST
// =============================================================================

export async function POST(req: NextRequest): Promise<NextResponse<TimelineResponse>> {
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
    const body = (await req.json()) as TimelineRequest
    const { filters = {}, limit = 100, includeStats = true } = body

    if (limit < 1 || limit > 500) {
      return NextResponse.json(
        { success: false, error: 'Limit doit être entre 1 et 500' },
        { status: 400 }
      )
    }

    // 3. Construction filtres service
    const serviceFilters: ServiceFilters = {
      domain: filters.domain,
      tribunalCode: filters.tribunalCode,
      chambreCode: filters.chambreCode,
      eventType: filters.eventType,
    }

    // Date range
    if (filters.dateFrom || filters.dateTo) {
      serviceFilters.dateRange = {
        from: filters.dateFrom ? new Date(filters.dateFrom) : undefined,
        to: filters.dateTo ? new Date(filters.dateTo) : undefined,
      }
    }

    // 4. Construction timeline
    const timeline = await buildJurisprudenceTimeline({
      filters: serviceFilters,
      limit,
      includeStats,
    })

    // 5. Statistiques et métadonnées
    const processingTimeMs = Date.now() - startTime

    const metadata = {
      processingTimeMs,
      eventsGenerated: timeline.events.length,
      dateRange: {
        earliest: timeline.stats.dateRange.earliest?.toISOString() || null,
        latest: timeline.stats.dateRange.latest?.toISOString() || null,
      },
    }

    return NextResponse.json({
      success: true,
      events: timeline.events,
      stats: includeStats ? timeline.stats : undefined,
      metadata,
    })
  } catch (error) {
    console.error('[API Jurisprudence Timeline] Error:', error)

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
// HANDLER GET (pour quick timeline sans filtres)
// =============================================================================

export async function GET(req: NextRequest): Promise<NextResponse<TimelineResponse>> {
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
    const domain = searchParams.get('domain') || undefined
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    // 3. Construction timeline simple
    const timeline = await buildJurisprudenceTimeline({
      filters: { domain },
      limit,
      includeStats: true,
    })

    const processingTimeMs = Date.now() - startTime

    return NextResponse.json({
      success: true,
      events: timeline.events,
      stats: timeline.stats,
      metadata: {
        processingTimeMs,
        eventsGenerated: timeline.events.length,
        dateRange: {
          earliest: timeline.stats.dateRange.earliest?.toISOString() || null,
          latest: timeline.stats.dateRange.latest?.toISOString() || null,
        },
      },
    })
  } catch (error) {
    console.error('[API Jurisprudence Timeline GET] Error:', error)

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
