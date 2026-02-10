import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

/**
 * GET /api/super-admin/classification/queue
 *
 * Récupère la file de pages nécessitant une revue humaine.
 * Utilise la fonction SQL get_classification_review_queue().
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')
    const priorities = searchParams.getAll('priority[]')
    const efforts = searchParams.getAll('effort[]')

    // Use the SQL function get_classification_review_queue
    const result = await db.query(
      `SELECT * FROM get_classification_review_queue($1, $2, $3, $4, $5)`,
      [
        priorities.length > 0 ? priorities : null,
        efforts.length > 0 ? efforts : null,
        null, // source_id
        limit,
        offset,
      ]
    )

    // Get stats
    const statsResult = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE review_priority = 'urgent') AS urgent,
        COUNT(*) FILTER (WHERE review_priority = 'high') AS high,
        COUNT(*) FILTER (WHERE review_priority = 'medium') AS medium,
        COUNT(*) FILTER (WHERE review_priority = 'low') AS low
      FROM legal_classifications
      WHERE requires_validation = true
    `)

    const stats = statsResult.rows[0]

    return NextResponse.json({
      items: result.rows,
      total: parseInt(stats.total) || 0,
      stats: {
        urgent: parseInt(stats.urgent) || 0,
        high: parseInt(stats.high) || 0,
        medium: parseInt(stats.medium) || 0,
        low: parseInt(stats.low) || 0,
      },
    })
  } catch (error) {
    console.error('[Classification Queue API] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
