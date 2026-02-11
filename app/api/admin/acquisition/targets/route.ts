/**
 * API : Gestion des Targets d'Acquisition
 *
 * GET  /api/admin/acquisition/targets - Liste tous les targets
 * POST /api/admin/acquisition/targets/create-sources - Créer les web sources
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  ACQUISITION_TARGETS,
  filterTargets,
  batchCreateWebSources,
  getAcquisitionStats,
  type AcquisitionTarget,
} from '@/lib/knowledge-base/acquisition-pipeline-service'

// =============================================================================
// GET - Liste des targets d'acquisition
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Filtres
    const source = searchParams.get('source')?.split(',')
    const category = searchParams.get('category')?.split(',')
    const minPriority = searchParams.get('minPriority')
      ? parseInt(searchParams.get('minPriority')!, 10)
      : undefined
    const onlyFundamental = searchParams.get('onlyFundamental') === 'true'

    // Récupérer les targets filtrés
    const targets = filterTargets({
      source,
      category,
      minPriority,
      onlyFundamental,
    })

    // Récupérer les stats globales
    const stats = await getAcquisitionStats()

    return NextResponse.json({
      success: true,
      data: {
        targets,
        stats,
        count: targets.length,
      },
    })
  } catch (error) {
    console.error('[API Acquisition Targets] Erreur GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST - Créer les web sources à partir des targets
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      userId,
      filters,
    }: {
      userId: string
      filters?: {
        source?: string[]
        minPriority?: number
      }
    } = body

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          error: 'userId requis',
        },
        { status: 400 }
      )
    }

    // Créer les web sources en batch
    const result = await batchCreateWebSources(userId, filters)

    return NextResponse.json({
      success: true,
      data: {
        created: result.created.length,
        skipped: result.skipped.length,
        errors: result.errors.length,
        details: result,
      },
    })
  } catch (error) {
    console.error('[API Acquisition Targets] Erreur POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
