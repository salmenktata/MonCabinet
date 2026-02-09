/**
 * API: Classification Review Queue
 *
 * GET /api/super-admin/classification/queue
 *
 * Récupère la liste des pages nécessitant revue humaine,
 * triées par priorité (urgent > high > medium > low) puis date (FIFO)
 *
 * Query params :
 * - priority[] : Filtrer par priorité (low, medium, high, urgent)
 * - effort[] : Filtrer par effort estimé (quick, moderate, complex)
 * - sourceId : Filtrer par source web
 * - limit : Nombre de résultats (défaut: 50, max: 200)
 * - offset : Pagination (défaut: 0)
 *
 * Response :
 * {
 *   items: ReviewQueueItem[],
 *   total: number,
 *   stats: { urgent, high, medium, low, noSignificantDocs, qualityIssues }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import type { ReviewPriority, ReviewEffort } from '@/lib/web-scraper/types'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// =============================================================================
// TYPES
// =============================================================================

export interface ReviewQueueItem {
  webPageId: string
  url: string
  title: string | null
  primaryCategory: string
  domain: string
  confidenceScore: number
  reviewPriority: ReviewPriority | null
  reviewEstimatedEffort: ReviewEffort | null
  validationReason: string | null
  sourceName: string
  createdAt: string
}

interface ReviewQueueStats {
  urgent: number
  high: number
  medium: number
  low: number
  noPriority: number
  total: number
}

interface ReviewQueueResponse {
  items: ReviewQueueItem[]
  total: number
  stats: ReviewQueueStats
}

// =============================================================================
// GET HANDLER
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    // Parse query params
    const { searchParams } = new URL(req.url)

    const priorities = searchParams.getAll('priority[]') as ReviewPriority[]
    const efforts = searchParams.getAll('effort[]') as ReviewEffort[]
    const sourceId = searchParams.get('sourceId') || null
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Validate priorities
    const validPriorities = ['low', 'medium', 'high', 'urgent']
    if (priorities.length > 0 && !priorities.every(p => validPriorities.includes(p))) {
      return NextResponse.json(
        { error: 'Priorités invalides. Valeurs acceptées : low, medium, high, urgent' },
        { status: 400 }
      )
    }

    // Validate efforts
    const validEfforts = ['quick', 'moderate', 'complex']
    if (efforts.length > 0 && !efforts.every(e => validEfforts.includes(e))) {
      return NextResponse.json(
        { error: 'Efforts invalides. Valeurs acceptées : quick, moderate, complex' },
        { status: 400 }
      )
    }

    // Appeler fonction SQL get_classification_review_queue()
    const priorityArray = priorities.length > 0 ? `ARRAY[${priorities.map(p => `'${p}'`).join(',')}]::text[]` : 'NULL'
    const effortArray = efforts.length > 0 ? `ARRAY[${efforts.map(e => `'${e}'`).join(',')}]::text[]` : 'NULL'
    const sourceIdParam = sourceId ? `'${sourceId}'::uuid` : 'NULL'

    const result = await db.query<{
      web_page_id: string
      url: string
      title: string | null
      primary_category: string
      domain: string
      confidence_score: string
      review_priority: ReviewPriority | null
      review_estimated_effort: ReviewEffort | null
      validation_reason: string | null
      source_name: string
      created_at: string
    }>(
      `SELECT * FROM get_classification_review_queue(
        ${priorityArray},
        ${effortArray},
        ${sourceIdParam},
        $1,
        $2
      )`,
      [limit, offset]
    )

    // Mapper les résultats au format API
    const items: ReviewQueueItem[] = result.rows.map(row => ({
      webPageId: row.web_page_id,
      url: row.url,
      title: row.title,
      primaryCategory: row.primary_category,
      domain: row.domain,
      confidenceScore: parseFloat(row.confidence_score),
      reviewPriority: row.review_priority,
      reviewEstimatedEffort: row.review_estimated_effort,
      validationReason: row.validation_reason,
      sourceName: row.source_name,
      createdAt: row.created_at,
    }))

    // Récupérer stats globales (sans filtres)
    const statsResult = await db.query<{
      total: string
      urgent: string
      high: string
      medium: string
      low: string
      no_priority: string
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE review_priority = 'urgent') as urgent,
        COUNT(*) FILTER (WHERE review_priority = 'high') as high,
        COUNT(*) FILTER (WHERE review_priority = 'medium') as medium,
        COUNT(*) FILTER (WHERE review_priority = 'low') as low,
        COUNT(*) FILTER (WHERE review_priority IS NULL) as no_priority
      FROM legal_classifications
      WHERE requires_validation = true`
    )

    const statsRow = statsResult.rows[0]
    const stats: ReviewQueueStats = {
      total: parseInt(statsRow.total),
      urgent: parseInt(statsRow.urgent),
      high: parseInt(statsRow.high),
      medium: parseInt(statsRow.medium),
      low: parseInt(statsRow.low),
      noPriority: parseInt(statsRow.no_priority),
    }

    const response: ReviewQueueResponse = {
      items,
      total: stats.total, // Total sans filtres pour pagination
      stats,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Classification Queue API] Error:', error)
    return NextResponse.json(
      {
        error: 'Erreur lors de la récupération de la queue de review',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
