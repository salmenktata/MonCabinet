import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ relationId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { relationId } = await params
    const body = await request.json()
    const { status, notes } = body

    const validStatuses = ['confirmed', 'dismissed', 'resolved']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Statut invalide' }, { status: 400 })
    }

    const { updateRelationStatus } = await import('@/lib/ai/kb-duplicate-detector-service')
    await updateRelationStatus(relationId, status, session.user.id, notes)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Erreur PATCH relation:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur serveur' },
      { status: 500 }
    )
  }
}
