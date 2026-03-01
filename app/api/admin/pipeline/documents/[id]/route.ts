/**
 * GET /api/admin/pipeline/documents/[id]
 * Détail complet d'un document + historique pipeline
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getDocumentPipelineDetail } from '@/lib/pipeline/document-pipeline-service'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const { id } = await params
    const detail = await getDocumentPipelineDetail(id)

    if (!detail) {
      return NextResponse.json({ error: 'Document non trouvé' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('[Pipeline API] Erreur détail document:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
