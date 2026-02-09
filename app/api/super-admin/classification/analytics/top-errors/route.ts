/**
 * API: Top Erreurs Classification
 *
 * GET /api/super-admin/classification/analytics/top-errors
 *
 * Retourne les top erreurs de classification (pages nécessitant validation)
 * groupées par domaine juridique, source, et raison de validation
 *
 * Query params :
 * - groupBy : Groupement (domain, source, reason) - défaut: domain
 * - limit : Nombre de résultats (défaut: 20, max: 100)
 *
 * Response :
 * {
 *   errors: TopError[],
 *   totalPagesRequiringReview: number,
 *   byDomain: Record<string, number>,
 *   bySource: Record<string, number>
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// =============================================================================
// TYPES
// =============================================================================

interface TopError {
  key: string // domain, source, ou reason selon groupBy
  count: number
  percentage: number
  avgConfidence: number
  examples: {
    url: string
    title: string | null
    priority: string | null
  }[]
}

interface TopErrorsResponse {
  errors: TopError[]
  totalPagesRequiringReview: number
  byDomain: Record<string, number>
  bySource: Record<string, number>
  byPriority: Record<string, number>
}

// =============================================================================
// GET HANDLER
// =============================================================================

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const groupBy = searchParams.get('groupBy') || 'domain'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)

    // Validation groupBy
    const validGroupBy = ['domain', 'source', 'reason']
    if (!validGroupBy.includes(groupBy)) {
      return NextResponse.json(
        { error: 'groupBy invalide. Valeurs acceptées : domain, source, reason' },
        { status: 400 }
      )
    }

    // Déterminer colonne SQL selon groupBy
    const groupColumn =
      groupBy === 'domain'
        ? 'lc.domain'
        : groupBy === 'source'
        ? 'ws.name'
        : 'lc.validation_reason'

    // Récupérer total pages nécessitant revue
    const totalResult = await db.query<{ total: string }>(
      `SELECT COUNT(*) as total
      FROM legal_classifications
      WHERE requires_validation = true`
    )
    const totalPagesRequiringReview = parseInt(totalResult.rows[0].total)

    // Récupérer top erreurs par groupement
    const errorsResult = await db.query<{
      key: string
      count: string
      avg_confidence: string
    }>(
      `SELECT
        ${groupColumn} as key,
        COUNT(*) as count,
        AVG(lc.confidence_score) as avg_confidence
      FROM legal_classifications lc
      JOIN web_pages wp ON lc.web_page_id = wp.id
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE lc.requires_validation = true
        AND ${groupColumn} IS NOT NULL
      GROUP BY ${groupColumn}
      ORDER BY count DESC
      LIMIT $1`,
      [limit]
    )

    // Pour chaque groupe, récupérer 3 exemples
    const errors: TopError[] = await Promise.all(
      errorsResult.rows.map(async row => {
        const examplesResult = await db.query<{
          url: string
          title: string | null
          priority: string | null
        }>(
          `SELECT
            wp.url,
            wp.title,
            lc.review_priority as priority
          FROM legal_classifications lc
          JOIN web_pages wp ON lc.web_page_id = wp.id
          JOIN web_sources ws ON wp.web_source_id = ws.id
          WHERE lc.requires_validation = true
            AND ${groupColumn} = $1
          ORDER BY lc.created_at DESC
          LIMIT 3`,
          [row.key]
        )

        return {
          key: row.key,
          count: parseInt(row.count),
          percentage: (parseInt(row.count) / totalPagesRequiringReview) * 100,
          avgConfidence: parseFloat(row.avg_confidence),
          examples: examplesResult.rows,
        }
      })
    )

    // Récupérer stats par domaine
    const byDomainResult = await db.query<{ domain: string; count: string }>(
      `SELECT
        lc.domain,
        COUNT(*) as count
      FROM legal_classifications lc
      WHERE lc.requires_validation = true
        AND lc.domain IS NOT NULL
      GROUP BY lc.domain`
    )
    const byDomain: Record<string, number> = Object.fromEntries(
      byDomainResult.rows.map(row => [row.domain, parseInt(row.count)])
    )

    // Récupérer stats par source
    const bySourceResult = await db.query<{ source_name: string; count: string }>(
      `SELECT
        ws.name as source_name,
        COUNT(*) as count
      FROM legal_classifications lc
      JOIN web_pages wp ON lc.web_page_id = wp.id
      JOIN web_sources ws ON wp.web_source_id = ws.id
      WHERE lc.requires_validation = true
      GROUP BY ws.name`
    )
    const bySource: Record<string, number> = Object.fromEntries(
      bySourceResult.rows.map(row => [row.source_name, parseInt(row.count)])
    )

    // Récupérer stats par priorité
    const byPriorityResult = await db.query<{ priority: string; count: string }>(
      `SELECT
        COALESCE(lc.review_priority, 'no_priority') as priority,
        COUNT(*) as count
      FROM legal_classifications lc
      WHERE lc.requires_validation = true
      GROUP BY lc.review_priority`
    )
    const byPriority: Record<string, number> = Object.fromEntries(
      byPriorityResult.rows.map(row => [row.priority, parseInt(row.count)])
    )

    const response: TopErrorsResponse = {
      errors,
      totalPagesRequiringReview,
      byDomain,
      bySource,
      byPriority,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Classification Top Errors API] Error:', error)
    return NextResponse.json(
      {
        error: 'Erreur lors de la récupération des erreurs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
