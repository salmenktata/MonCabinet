/**
 * POST /api/admin/pipeline/bulk/reject
 * Rejette N documents en batch (max 100)
 * Body: { docIds: string[], reason: string }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { bulkReject } from '@/lib/pipeline/document-pipeline-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const body = await request.json()
    const { docIds, reason } = body as { docIds: string[]; reason: string }

    if (!Array.isArray(docIds) || docIds.length === 0) {
      return NextResponse.json({ error: 'docIds requis (tableau non vide)' }, { status: 400 })
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Raison requise' }, { status: 400 })
    }

    if (docIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 documents par batch' }, { status: 400 })
    }

    const result = await bulkReject(docIds, session.user.id, reason.trim())

    return NextResponse.json(result)
  } catch (error) {
    console.error('[Pipeline API] Erreur bulk reject:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
