import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type ReviewPriority = 'low' | 'medium' | 'high' | 'urgent'
type ReviewEffort = 'quick' | 'moderate' | 'complex'

interface ReviewQueueItem {
  web_page_id: string
  url: string
  title: string | null
  confidence_score: number
  review_priority: string | null
  review_estimated_effort: string | null
  validation_reason: string | null
  primary_category: string
  domain: string | null
  source_name: string
  created_at: string
}

interface ReviewQueueStats {
  urgent: number
  high: number
  medium: number
  low: number
  noPriority: number
}

/**
 * GET /api/super-admin/classification/queue
 * 
 * Récupère les pages nécessitant une revue humaine avec filtres et priorisation
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    // Parse filters
    const priorities = searchParams.getAll('priority[]') as ReviewPriority[]
    const efforts = searchParams.getAll('effort[]') as ReviewEffort[]
    const sourceId = searchParams.get('sourceId') || null
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Call SQL function
    const result = await db.query(
      `SELECT * FROM get_classification_review_queue($1, $2, $3, $4, $5)`,
      [
        priorities.length > 0 ? priorities : null,
        efforts.length > 0 ? efforts : null,
        sourceId,
        limit,
        offset,
      ]
    )

    const items: ReviewQueueItem[] = result.rows

    // Get stats
    const statsResult = await db.query(`SELECT * FROM get_review_queue_stats()`)
    const statsRow = statsResult.rows[0]

    const stats: ReviewQueueStats = {
      urgent: parseInt(statsRow.urgent_count || '0'),
      high: parseInt(statsRow.high_count || '0'),
      medium: parseInt(statsRow.medium_count || '0'),
      low: parseInt(statsRow.low_count || '0'),
      noPriority: parseInt(statsRow.no_priority_count || '0'),
    }

    const total = parseInt(statsRow.total_count || '0')

    return NextResponse.json({
      items,
      total,
      stats,
    })
  } catch (error) {
    console.error('Error fetching classification queue:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
