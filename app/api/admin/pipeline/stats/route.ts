/**
 * GET /api/admin/pipeline/stats
 * Stats funnel pipeline KB (comptage par étape, bottlenecks)
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getPipelineFunnelStats, getBottlenecks, getAverageTimePerStage, getThroughputStats } from '@/lib/pipeline/pipeline-stats-service'
import { checkAdminAccess } from '@/lib/auth/check-admin-access'

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }
    if (!(await checkAdminAccess(session.user.id))) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const [funnel, bottlenecks, avgTimePerStage, throughput] = await Promise.all([
      getPipelineFunnelStats(),
      getBottlenecks(),
      getAverageTimePerStage(),
      getThroughputStats(),
    ])

    return NextResponse.json({ funnel, bottlenecks, avgTimePerStage, throughput })
  } catch (error) {
    console.error('[Pipeline API] Erreur stats:', error)
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    )
  }
}
