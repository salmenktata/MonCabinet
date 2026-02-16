/**
 * POST /api/admin/pipeline/documents/[id]/reject
 * Rejette un document avec raison
 * Body: { reason: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { rejectDocument } from '@/lib/pipeline/document-pipeline-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

export async function POST(
  request: NextRequest,
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
    const body = await request.json()
    const { reason } = body as { reason: string }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Raison requise' }, { status: 400 })
    }

    const result = await rejectDocument(id, session.user.id, reason.trim())

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Pipeline API] Erreur reject:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
