/**
 * GET /api/admin/pipeline/documents/[id]/history
 * Historique audit pipeline d'un document
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getDocumentHistory } from '@/lib/pipeline/document-pipeline-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

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
    const history = await getDocumentHistory(id)

    return NextResponse.json({ history })
  } catch (error) {
    console.error('[Pipeline API] Erreur history:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
