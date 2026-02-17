import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/admin/production-monitoring/timeseries
 *
 * Données temporelles pour graphiques (queries, latence, erreurs, coût)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get('range') || '24h'

    // Déterminer l'intervalle et le format de groupement
    let interval: string
    let groupBy: string
    let dateFormat: string

    switch (range) {
      case '1h':
        interval = '1 hour'
        groupBy = "date_trunc('minute', created_at)"
        dateFormat = 'YYYY-MM-DD HH24:MI'
        break
      case '7d':
        interval = '7 days'
        groupBy = "date_trunc('hour', created_at)"
        dateFormat = 'YYYY-MM-DD HH24:00'
        break
      case '24h':
      default:
        interval = '24 hours'
        groupBy = "date_trunc('hour', created_at)"
        dateFormat = 'YYYY-MM-DD HH24:00'
        break
    }

    // =========================================================================
    // Agrégation temporelle
    // NOTE: Latence estimée via tokens × 50ms (pas de colonne updated_at)
    // =========================================================================
    const timeSeriesResult = await db.query(`
      SELECT
        TO_CHAR(${groupBy}, '${dateFormat}') as timestamp,
        COUNT(*) FILTER (WHERE role = 'user')::int as queries,
        ROUND(AVG(
          CASE
            WHEN role = 'assistant' AND tokens_used IS NOT NULL
            THEN tokens_used * 50
            ELSE NULL
          END
        ))::int as latency,
        COUNT(*) FILTER (
          WHERE role = 'assistant' AND (content ILIKE '%erreur%' OR content ILIKE '%error%')
        )::int as errors,
        0 as cost
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY ${groupBy}
      ORDER BY ${groupBy} ASC
    `)

    const data = timeSeriesResult.rows.map(row => ({
      timestamp: row.timestamp,
      queries: row.queries || 0,
      latency: row.latency || 0,
      errors: row.errors || 0,
      cost: row.cost || 0, // Coût = 0 (Groq/Gemini gratuit)
    }))

    return NextResponse.json({
      data: data,
      range: range,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    console.error('[Production Monitoring TimeSeries] Erreur:', error)
    return NextResponse.json(
      {
        error: getErrorMessage(error) || 'Erreur lors de la récupération des données temporelles',
      },
      { status: 500 }
    )
  }
}
