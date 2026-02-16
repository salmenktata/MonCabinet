/**
 * GET /api/admin/pipeline/stats
 * Stats funnel pipeline KB (comptage par étape, bottlenecks)
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getPipelineFunnelStats, getBottlenecks } from '@/lib/pipeline/pipeline-stats-service'

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  return ['admin', 'super_admin'].includes(result.rows[0]?.role)
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const [funnel, bottlenecks] = await Promise.all([
      getPipelineFunnelStats(),
      getBottlenecks(),
    ])

    return NextResponse.json({ funnel, bottlenecks })
  } catch (error) {
    console.error('[Pipeline API] Erreur stats:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
