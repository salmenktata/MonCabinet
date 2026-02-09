/**
 * API Route: Administration - Métriques RAG
 *
 * GET /api/admin/rag-metrics
 * - Retourne les métriques du système RAG (latence, tokens, erreurs, cache)
 * - Supporte le format JSON ou Prometheus
 * - Requiert le rôle SUPER_ADMIN
 * Cache: 1 minute (métriques temps réel)
 *
 * POST /api/admin/rag-metrics
 * - Actions de maintenance (reset circuit breaker, reset compteurs erreurs)
 * - Requiert le rôle SUPER_ADMIN
 *
 * Query params (GET):
 * - format: 'json' (défaut) | 'prometheus'
 * - period: durée en ms (défaut: 900000 = 15min)
 */

import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import {
  getRAGMetricsSummary,
  getErrorCounters,
  getRawMetrics,
  checkRAGHealth,
  getPrometheusMetrics,
  resetErrorCounters,
} from '@/lib/metrics/rag-metrics'
import {
  getCircuitBreakerState,
  resetCircuitBreaker,
  getEmbeddingProviderInfo,
} from '@/lib/ai/embeddings-service'
import { getRerankerInfo } from '@/lib/ai/reranker-service'
import { getRAGConfig } from '@/lib/ai/config'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'

// =============================================================================
// Helper: Vérification accès super-admin
// =============================================================================

async function checkSuperAdminAccess(): Promise<{ authorized: boolean; error?: NextResponse }> {
  const session = await getSession()

  if (!session?.user?.id) {
    return {
      authorized: false,
      error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    }
  }

  // Vérifier le rôle super-admin
  if (session.user.role !== 'SUPER_ADMIN') {
    return {
      authorized: false,
      error: NextResponse.json({ error: 'Accès réservé aux super-administrateurs' }, { status: 403 }),
    }
  }

  return { authorized: true }
}

// =============================================================================
// GET: Métriques RAG
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const access = await checkSuperAdminAccess()
    if (!access.authorized) {
      return access.error!
    }

    const searchParams = request.nextUrl.searchParams
    const format = searchParams.get('format') || 'json'
    const period = parseInt(searchParams.get('period') || '900000', 10)
    const includeRaw = searchParams.get('raw') === 'true'
    const rawLimit = parseInt(searchParams.get('rawLimit') || '50', 10)

    // Format Prometheus
    if (format === 'prometheus') {
      const prometheusOutput = getPrometheusMetrics()
      return new NextResponse(prometheusOutput, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
        },
      })
    }

    // Format JSON (par défaut)
    const summary = getRAGMetricsSummary(period)
    const errors = getErrorCounters()
    const health = checkRAGHealth()
    const circuitBreaker = getCircuitBreakerState()
    const reranker = getRerankerInfo()
    const embeddingProvider = getEmbeddingProviderInfo()

    const response: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      periodMs: period,

      // Résumé des métriques
      summary,

      // Santé du système
      health: {
        ...health,
        status: health.healthy ? 'healthy' : 'unhealthy',
      },

      // État des composants
      components: {
        circuitBreaker: {
          ...circuitBreaker,
          description:
            circuitBreaker.state === 'OPEN'
              ? 'Ollama indisponible, fallback actif'
              : circuitBreaker.state === 'HALF_OPEN'
                ? 'Test de récupération Ollama en cours'
                : 'Fonctionnement normal',
        },
        reranker: {
          ...reranker,
          description: reranker.loaded
            ? 'Cross-encoder chargé et actif'
            : reranker.enabled
              ? 'Cross-encoder en attente de chargement'
              : 'Cross-encoder désactivé',
        },
        embedding: {
          ...embeddingProvider,
          description:
            embeddingProvider.provider === 'ollama'
              ? 'Embeddings locaux via Ollama (gratuit)'
              : embeddingProvider.provider === 'openai'
                ? 'Embeddings cloud via OpenAI (payant)'
                : 'Aucun provider configuré',
        },
      },

      // Compteurs d'erreurs
      errors,

      // Seuils de référence
      thresholds: {
        latencyP95Warning: 5000,
        latencyP95Critical: 10000,
        errorRateWarning: 5,
        errorRateCritical: 10,
        cacheHitRateWarning: 30,
      },

      // Configuration RAG actuelle
      ragConfig: getRAGConfig(),
    }

    // Inclure les métriques brutes si demandé (pour debug)
    if (includeRaw) {
      response.raw = getRawMetrics(rawLimit)
    }

    return NextResponse.json(response, {
      headers: getCacheHeaders(CACHE_PRESETS.SHORT) // Cache 1 minute
    })
  } catch (error) {
    console.error('Erreur métriques RAG:', error)
    return NextResponse.json(
      { error: 'Erreur récupération métriques RAG' },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST: Actions de maintenance
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const access = await checkSuperAdminAccess()
    if (!access.authorized) {
      return access.error!
    }

    const body = await request.json()
    const { action } = body

    if (!action) {
      return NextResponse.json(
        { error: 'Action requise' },
        { status: 400 }
      )
    }

    const results: Record<string, unknown> = {
      action,
      timestamp: new Date().toISOString(),
      success: false,
    }

    switch (action) {
      case 'reset_circuit_breaker':
        // Reset du circuit breaker Ollama
        resetCircuitBreaker()
        results.success = true
        results.message = 'Circuit breaker réinitialisé (état: CLOSED)'
        results.newState = getCircuitBreakerState()
        break

      case 'reset_error_counters':
        // Reset des compteurs d'erreurs
        resetErrorCounters()
        results.success = true
        results.message = 'Compteurs d\'erreurs réinitialisés'
        results.newCounters = getErrorCounters()
        break

      case 'reset_all':
        // Reset circuit breaker + compteurs d'erreurs
        resetCircuitBreaker()
        resetErrorCounters()
        results.success = true
        results.message = 'Circuit breaker et compteurs réinitialisés'
        results.circuitBreaker = getCircuitBreakerState()
        results.errorCounters = getErrorCounters()
        break

      default:
        return NextResponse.json(
          {
            error: 'Action non reconnue',
            validActions: ['reset_circuit_breaker', 'reset_error_counters', 'reset_all'],
          },
          { status: 400 }
        )
    }

    console.log('[RAG Admin]', JSON.stringify(results))

    return NextResponse.json(results)
  } catch (error) {
    console.error('Erreur action RAG:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'action' },
      { status: 500 }
    )
  }
}
