/**
 * PATCH /api/admin/pipeline/documents/[id]/edit
 * Édite le contenu/metadata d'un document à son étape courante
 * Body: { title?, full_text?, category?, subcategory?, description?, tags?, language?, pipeline_notes? }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { editDocumentAtStage } from '@/lib/pipeline/document-pipeline-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

export async function PATCH(
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

    const result = await editDocumentAtStage(id, session.user.id, body)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Pipeline API] Erreur edit:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
