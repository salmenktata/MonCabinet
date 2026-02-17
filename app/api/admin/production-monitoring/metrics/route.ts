import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/admin/production-monitoring/metrics
 *
 * Métriques de production basées sur les données réelles
 * Agrégation depuis chat_messages, web_crawl_jobs, etc.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '24h'

    // Calculer l'intervalle de temps
    const intervalMap: Record<string, string> = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
    }
    const interval = intervalMap[range] || '24 hours'

    // =========================================================================
    // 1. Queries par heure (basé sur chat_messages)
    // =========================================================================
    const queriesResult = await db.query(`
      SELECT
        COUNT(*)::int as total_queries,
        ROUND(COUNT(*)::numeric / EXTRACT(EPOCH FROM INTERVAL '${interval}') * 3600, 2) as queries_per_hour
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
        AND role = 'user'
    `)

    const queriesData = queriesResult.rows[0]

    // =========================================================================
    // 2. Utilisateurs actifs (conversations uniques)
    // =========================================================================
    const usersResult = await db.query(`
      SELECT COUNT(DISTINCT conversation_id)::int as active_users
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
    `)

    const activeUsers = usersResult.rows[0]?.active_users || 0

    // =========================================================================
    // 3. Latence moyenne (estimation basée sur tokens_used)
    // =========================================================================
    // NOTE: Table chat_messages n'a pas de colonne updated_at
    // Estimation : ~50ms par token (modèles rapides Groq/Gemini)
    const latencyEstimateResult = await db.query(`
      SELECT
        (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY tokens_used) * 50)::int as p50,
        (PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY tokens_used) * 50)::int as p95
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
        AND role = 'assistant'
        AND tokens_used IS NOT NULL
    `)

    const latency = latencyEstimateResult.rows[0] || { p50: 0, p95: 0 }

    // =========================================================================
    // 4. Taux d'erreur (messages sans réponse ou avec erreur)
    // =========================================================================
    const errorRateResult = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE content ILIKE '%erreur%' OR content ILIKE '%error%')::numeric as errors,
        COUNT(*)::numeric as total
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
        AND role = 'assistant'
    `)

    const errorData = errorRateResult.rows[0]
    const errorRate = errorData.total > 0
      ? parseFloat(((errorData.errors / errorData.total) * 100).toFixed(2))
      : 0

    // =========================================================================
    // 5. Coût par query (estimation basée sur tokens_used)
    // =========================================================================
    const costResult = await db.query(`
      SELECT
        COALESCE(AVG(tokens_used), 0)::int as avg_tokens
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
        AND role = 'assistant'
        AND tokens_used IS NOT NULL
    `)

    const avgTokens = costResult.rows[0]?.avg_tokens || 0
    // Estimation : Groq gratuit, Gemini gratuit, donc coût = 0 TND
    const costPerQuery = 0 // TND

    // =========================================================================
    // 6. Métriques qualité (mock - à implémenter avec feedback utilisateurs)
    // =========================================================================
    const averageRating = 4.2 // Mock - nécessite table user_feedback
    const hallucinationRate = 0.05 // Mock - 5%
    const citationAccuracy = 0.92 // Mock - 92%

    // =========================================================================
    // Réponse
    // =========================================================================
    return NextResponse.json({
      metrics: {
        queriesPerHour: queriesData.queries_per_hour || 0,
        activeUsers: activeUsers,
        peakConcurrency: Math.ceil(activeUsers * 0.3), // Estimation
        averageRating: averageRating,
        hallucinationRate: hallucinationRate,
        citationAccuracy: citationAccuracy,
        latencyP50: latency.p50 || 0,
        latencyP95: latency.p95 || 0,
        errorRate: errorRate,
        costPerQuery: costPerQuery,
        monthlyBudget: 10, // USD
      },
      range: range,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Production Monitoring] Erreur:', error)
    return NextResponse.json(
      {
        error: getErrorMessage(error) || 'Erreur lors de la récupération des métriques',
      },
      { status: 500 }
    )
  }
}
