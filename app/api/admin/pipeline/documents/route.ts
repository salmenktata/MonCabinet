/**
 * GET /api/admin/pipeline/documents?stage=crawled&page=1&limit=20&search=&category=&sortBy=&sortOrder=
 * Liste paginée des documents à une étape du pipeline
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getStageDocuments } from '@/lib/pipeline/pipeline-stats-service'
import type { PipelineStage } from '@/lib/pipeline/document-pipeline-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

const VALID_STAGES: PipelineStage[] = [
  'source_configured', 'crawled', 'content_reviewed', 'classified',
  'indexed', 'quality_analyzed', 'rag_active', 'rejected', 'needs_revision',
]

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const stage = searchParams.get('stage') as PipelineStage
    const page = parseInt(searchParams.get('page') || '1')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const search = searchParams.get('search') || undefined
    const category = searchParams.get('category') || undefined
    const language = searchParams.get('language') || undefined
    const sortBy = searchParams.get('sortBy') || undefined
    const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc'

    if (!stage || !VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: 'Stage invalide' }, { status: 400 })
    }

    const result = await getStageDocuments(stage, page, limit, {
      search, category, language, sortBy, sortOrder,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Pipeline API] Erreur documents:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
