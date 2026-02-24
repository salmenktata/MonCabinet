/**
 * GET /api/admin/monitoring/providers-health
 *
 * Health check réel de tous les providers LLM configurés.
 * Détecte les clés expirées, les quotas dépassés et les providers
 * actuellement en circuit breaker.
 *
 * Utilise checkAllProvidersHealth() avec cache 5 min côté service.
 *
 * @module app/api/admin/monitoring/providers-health
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import {
  checkAllProvidersHealth,
  getAvailableProviders,
  type LLMProvider,
} from '@/lib/ai/llm-fallback-service'

export const dynamic = 'force-dynamic'

async function handler(request: NextRequest) {
  // Permettre ping rapide sans health check complet
  const quick = request.nextUrl.searchParams.get('quick') === 'true'

  const configured = getAvailableProviders()

  if (quick) {
    // Mode rapide : retourne uniquement les providers configurés sans ping réel
    return NextResponse.json({
      success: true,
      quick: true,
      configured,
      timestamp: new Date().toISOString(),
    })
  }

  // Health check complet : ping chaque provider
  const startMs = Date.now()
  const healthResults = await checkAllProvidersHealth()
  const durationMs = Date.now() - startMs

  const providers = Object.entries(healthResults).map(([provider, ok]) => ({
    provider: provider as LLMProvider,
    configured: configured.includes(provider as LLMProvider),
    healthy: ok,
    status: ok ? 'ok' : 'error',
  }))

  const healthyCount = providers.filter(p => p.healthy).length
  const totalConfigured = providers.filter(p => p.configured).length

  return NextResponse.json({
    success: true,
    summary: {
      healthy: healthyCount,
      total: totalConfigured,
      allHealthy: healthyCount === totalConfigured,
    },
    providers,
    durationMs,
    timestamp: new Date().toISOString(),
  })
}

export const GET = withAdminApiAuth(handler)
