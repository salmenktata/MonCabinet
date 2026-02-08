import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role
  return role === 'admin' || role === 'super_admin'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const { batchId } = await params
    const { getBulkImportProgress } = await import('@/lib/ai/kb-bulk-import-service')
    const progress = await getBulkImportProgress(batchId)

    if (!progress) {
      return NextResponse.json({ error: 'Batch non trouvé' }, { status: 404 })
    }

    return NextResponse.json({ progress })
  } catch (error) {
    console.error('Erreur GET batch progress:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
