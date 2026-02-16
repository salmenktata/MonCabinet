/**
 * API : Liste des Documents par Étape
 * GET /api/admin/pipeline/documents
 *
 * Query params : stage, page, limit, category, search, sourceId
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getStageDocuments } from '@/lib/pipeline/pipeline-stats-service'
import type { PipelineStage } from '@/lib/pipeline/document-pipeline-service'

const VALID_STAGES: PipelineStage[] = [
  'source_configured',
  'crawled',
  'content_reviewed',
  'classified',
  'indexed',
  'quality_analyzed',
  'rag_active',
  'rejected',
  'needs_revision',
]

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()

    // Vérification authentification et rôle (admin ou super_admin)
    const allowedRoles = ['admin', 'super_admin']
    if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Non autorisé - rôle admin ou super_admin requis' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)

    // Parse query params
    const stage = (searchParams.get('stage') || 'indexed') as PipelineStage
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const category = searchParams.get('category') || undefined
    const search = searchParams.get('search') || undefined
    const sourceId = searchParams.get('sourceId') || undefined
    const sortBy = searchParams.get('sortBy') || 'pipeline_stage_updated_at'
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    // Validation
    if (!VALID_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Stage invalide. Valeurs acceptées: ${VALID_STAGES.join(', ')}` },
        { status: 400 }
      )
    }

    if (limit > 100) {
      return NextResponse.json(
        { error: 'Limite maximale : 100 documents par page' },
        { status: 400 }
      )
    }

    const result = await getStageDocuments(stage, page, limit, {
      category,
      search,
      sourceId,
      sortBy,
      sortOrder,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Erreur API /pipeline/documents:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
