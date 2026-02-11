import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db/postgres'

/**
 * API Route - Production Monitoring Metrics
 *
 * Retourne métriques temps réel agrégées :
 * - Volume : queries/heure, active users, peak concurrency
 * - Qualité : rating moyen, hallucination rate, citation accuracy
 * - Performance : latency P50/P95, error rate
 * - Coûts : cost/query, monthly budget
 *
 * Paramètres query :
 * - range : '1h' | '24h' | '7d' (défaut '24h')
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authentification admin
    const session = await getServerSession()
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse query params
    const searchParams = req.nextUrl.searchParams
    const range = searchParams.get('range') || '24h'

    let interval: string
    switch (range) {
      case '1h':
        interval = '1 hour'
        break
      case '7d':
        interval = '7 days'
        break
      case '24h':
      default:
        interval = '24 hours'
        break
    }

    // 3. Calcul métriques
    const metrics = await calculateMetrics(interval)

    return NextResponse.json({
      success: true,
      metrics,
      timestamp: new Date().toISOString(),
      range,
    })
  } catch (error) {
    console.error('Error in /api/admin/production-monitoring/metrics:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

async function calculateMetrics(interval: string) {
  // 1. Volume Metrics
  const volumeQuery = await db.query(
    `
    SELECT
      COUNT(*)::INTEGER AS total_queries,
      COUNT(DISTINCT user_id)::INTEGER AS active_users,
      EXTRACT(EPOCH FROM ($1::INTERVAL)) / 3600 AS hours
    FROM conversations
    WHERE created_at >= NOW() - $1::INTERVAL
  `,
    [interval]
  )

  const { total_queries, active_users, hours } = volumeQuery.rows[0]
  const queriesPerHour = Math.round(total_queries / Math.max(hours, 1))

  // Peak concurrency (max queries dans fenêtre 5 minutes)
  const peakConcurrencyQuery = await db.query(`
    SELECT MAX(query_count)::INTEGER AS peak_concurrency
    FROM (
      SELECT
        DATE_TRUNC('minute', created_at) AS minute_bucket,
        COUNT(*) AS query_count
      FROM conversations
      WHERE created_at >= NOW() - $1::INTERVAL
      GROUP BY minute_bucket
    ) subquery
  `, [interval])

  const peakConcurrency = peakConcurrencyQuery.rows[0]?.peak_concurrency || 0

  // 2. Quality Metrics
  const qualityQuery = await db.query(
    `
    SELECT
      AVG(rating)::FLOAT AS avg_rating,
      COUNT(*) FILTER (WHERE 'hallucination' = ANY(feedback_type))::FLOAT / NULLIF(COUNT(*), 0) * 100 AS hallucination_rate,
      100 - (COUNT(*) FILTER (WHERE 'incorrect_citation' = ANY(feedback_type))::FLOAT / NULLIF(COUNT(*), 0) * 100) AS citation_accuracy
    FROM rag_feedback
    WHERE created_at >= NOW() - $1::INTERVAL
  `,
    [interval]
  )

  const {
    avg_rating = 4.5, // Valeur par défaut si pas de feedbacks
    hallucination_rate = 0,
    citation_accuracy = 98,
  } = qualityQuery.rows[0] || {}

  // 3. Performance Metrics
  const perfQuery = await db.query(
    `
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::INTEGER AS p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::INTEGER AS p95,
      COUNT(*) FILTER (WHERE success = false)::FLOAT / NULLIF(COUNT(*), 0) * 100 AS error_rate
    FROM ai_usage_logs
    WHERE operation = 'chat' AND created_at >= NOW() - $1::INTERVAL
  `,
    [interval]
  )

  const {
    p50 = 3000, // Valeurs par défaut
    p95 = 8000,
    error_rate = 0,
  } = perfQuery.rows[0] || {}

  // 4. Cost Metrics
  const costQuery = await db.query(
    `
    SELECT
      SUM(cost)::FLOAT AS total_cost,
      COUNT(*)::INTEGER AS total_requests
    FROM ai_usage_logs
    WHERE created_at >= NOW() - $1::INTERVAL
  `,
    [interval]
  )

  const { total_cost = 0, total_requests = 1 } = costQuery.rows[0] || {}
  const costPerQuery = total_requests > 0 ? total_cost / total_requests : 0

  // Projection budget mensuel (basé sur queries/hour moyen)
  const monthlyBudget = costPerQuery * queriesPerHour * 24 * 30

  return {
    // Volume
    queriesPerHour,
    activeUsers,
    peakConcurrency,

    // Qualité
    averageRating: parseFloat(avg_rating.toFixed(2)),
    hallucinationRate: parseFloat(hallucination_rate.toFixed(3)),
    citationAccuracy: parseFloat(citation_accuracy.toFixed(2)),

    // Performance
    latencyP50: p50,
    latencyP95: p95,
    errorRate: parseFloat(error_rate.toFixed(3)),

    // Coûts
    costPerQuery: parseFloat(costPerQuery.toFixed(4)),
    monthlyBudget: parseFloat(monthlyBudget.toFixed(2)),
  }
}
