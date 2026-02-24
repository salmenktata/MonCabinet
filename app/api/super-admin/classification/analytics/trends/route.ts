import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/super-admin/classification/analytics/trends
 *
 * Retourne le nombre de corrections par jour sur les N derniers jours.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days = Math.min(parseInt(searchParams.get('days') || '30'), 90)

    const result = await db.query(
      `SELECT
        TO_CHAR(DATE(corrected_at), 'YYYY-MM-DD') AS date,
        COUNT(*) AS count
      FROM classification_corrections
      WHERE corrected_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(corrected_at)
      ORDER BY DATE(corrected_at) ASC`
    )

    const trends = result.rows.map((row: any) => ({
      date: row.date,
      count: parseInt(row.count, 10) || 0,
    }))

    return NextResponse.json(
      { trends, days },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    )
  } catch (error) {
    console.error('[Classification Analytics Trends API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
