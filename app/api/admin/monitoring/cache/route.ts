/**
 * API Monitoring Cache Redis
 *
 * Retourne les métriques de cache (hits, misses, hit rate) pour monitoring qualité RAG.
 * Protégé par authentification admin.
 *
 * @route GET /api/admin/monitoring/cache
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getCacheMetricsForDay,
  getCacheMetricsHistory,
  getSearchCacheStats,
  type CacheMetrics,
} from '@/lib/cache/search-cache'
import { isRedisAvailable } from '@/lib/cache/redis'

// =============================================================================
// TYPES RÉPONSE
// =============================================================================

interface CacheMonitoringResponse {
  available: boolean
  today: CacheMetrics
  last7Days: Record<string, CacheMetrics>
  stats: {
    scopeCount?: number
    totalEntries?: number
  }
  recommendations?: string[]
}

// =============================================================================
// HANDLER GET
// =============================================================================

/**
 * GET /api/admin/monitoring/cache
 *
 * Retourne métriques cache Redis pour monitoring
 */
export async function GET(request: NextRequest) {
  try {
    // Auth: X-Cron-Secret ou Bearer token
    const authHeader = request.headers.get('x-cron-secret') || request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    // Vérifier disponibilité Redis
    const available = isRedisAvailable()

    if (!available) {
      return NextResponse.json({
        available: false,
        today: { hits: 0, misses: 0, sets: 0, hitRate: 0 },
        last7Days: {},
        stats: {},
        recommendations: ['Redis indisponible - Vérifier connexion'],
      } as CacheMonitoringResponse)
    }

    // Récupérer métriques
    const today = new Date().toISOString().slice(0, 10)
    const [todayMetrics, history, stats] = await Promise.all([
      getCacheMetricsForDay(today),
      getCacheMetricsHistory(7),
      getSearchCacheStats(),
    ])

    // Générer recommandations automatiques
    const recommendations: string[] = []

    if (todayMetrics.hitRate < 30 && todayMetrics.hits + todayMetrics.misses > 50) {
      recommendations.push(
        `Hit rate faible (${todayMetrics.hitRate.toFixed(1)}%) - Envisager augmenter threshold (actuel: 0.75)`
      )
    }

    if (todayMetrics.hitRate > 80 && todayMetrics.hits + todayMetrics.misses > 50) {
      recommendations.push(
        `Excellent hit rate (${todayMetrics.hitRate.toFixed(1)}%) - Cache très efficace ✅`
      )
    }

    if (stats.totalEntries && stats.totalEntries > 5000) {
      recommendations.push(
        `Cache volumineux (${stats.totalEntries} entrées) - Surveiller utilisation mémoire Redis`
      )
    }

    const response: CacheMonitoringResponse = {
      available: true,
      today: todayMetrics,
      last7Days: history,
      stats,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    }

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('[API Cache Monitoring] Erreur:', error)

    return NextResponse.json(
      {
        error: 'Erreur serveur lors de la récupération des métriques cache',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
