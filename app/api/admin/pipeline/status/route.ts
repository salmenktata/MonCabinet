/**
 * API : Statut Global du Pipeline
 * GET /api/admin/pipeline/status
 *
 * Retourne les stats du funnel, bottlenecks et statistiques de retry
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getPipelineFunnelStats, getBottlenecks } from '@/lib/pipeline/pipeline-stats-service'
import { getRetryStats, getRetryStatsByStage } from '@/lib/pipeline/pipeline-retry-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()

    // Vérification authentification et rôle
    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Non autorisé - rôle super_admin requis' },
        { status: 401 }
      )
    }

    // Récupérer toutes les stats en parallèle
    const [funnelStats, bottlenecks, retryStats24h, retryByStage] = await Promise.all([
      getPipelineFunnelStats(),
      getBottlenecks(),
      getRetryStats(24), // 24h
      getRetryStatsByStage(24),
    ])

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      funnel: funnelStats,
      bottlenecks,
      retry: {
        last24h: retryStats24h,
        byStage: retryByStage,
      },
    })
  } catch (error) {
    console.error('Erreur API /pipeline/status:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur lors de la récupération des stats',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
