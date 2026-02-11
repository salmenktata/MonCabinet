import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { db } from '@/lib/db/postgres'

/**
 * API Route - Production Monitoring Time Series
 *
 * Retourne données historiques pour graphiques :
 * - Queries par heure
 * - Latence moyenne par heure
 * - Erreurs par heure
 * - Coût par heure
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
    let truncate: string
    let limit: number

    switch (range) {
      case '1h':
        interval = '1 hour'
        truncate = 'minute' // Granularité 1 minute
        limit = 60
        break
      case '7d':
        interval = '7 days'
        truncate = 'hour' // Granularité 1 heure
        limit = 168 // 7 jours × 24h
        break
      case '24h':
      default:
        interval = '24 hours'
        truncate = 'hour' // Granularité 1 heure
        limit = 24
        break
    }

    // 3. Récupération données time series
    const timeSeriesData = await getTimeSeriesData(interval, truncate, limit)

    return NextResponse.json({
      success: true,
      data: timeSeriesData,
      timestamp: new Date().toISOString(),
      range,
    })
  } catch (error) {
    console.error('Error in /api/admin/production-monitoring/timeseries:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

async function getTimeSeriesData(interval: string, truncate: string, limit: number) {
  // Query combinée pour obtenir toutes les métriques par bucket temporel
  const result = await db.query(
    `
    WITH time_buckets AS (
      SELECT
        DATE_TRUNC($2, created_at) AS bucket,
        COUNT(*)::INTEGER AS queries,
        AVG(latency_ms)::INTEGER AS latency,
        COUNT(*) FILTER (WHERE success = false)::INTEGER AS errors,
        SUM(cost)::FLOAT AS cost
      FROM ai_usage_logs
      WHERE
        operation = 'chat'
        AND created_at >= NOW() - $1::INTERVAL
      GROUP BY bucket
      ORDER BY bucket DESC
      LIMIT $3
    )
    SELECT
      bucket,
      queries,
      COALESCE(latency, 0) AS latency,
      errors,
      COALESCE(cost, 0) AS cost
    FROM time_buckets
    ORDER BY bucket ASC
  `,
    [interval, truncate, limit]
  )

  // Format pour Recharts
  return result.rows.map((row) => ({
    timestamp: row.bucket.toISOString(),
    queries: row.queries || 0,
    latency: row.latency || 0,
    errors: row.errors || 0,
    cost: parseFloat((row.cost || 0).toFixed(4)),
  }))
}
