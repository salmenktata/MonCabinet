/**
 * API : Leaderboard Validateurs KB
 *
 * GET /api/admin/kb-quality/leaderboard - Top 10 validateurs
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

// =============================================================================
// GET - Leaderboard des validateurs
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10', 10)
    const period = searchParams.get('period') || 'all' // all, week, month

    // Calculer date de début selon période
    let dateFilter = ''
    if (period === 'week') {
      dateFilter = "AND last_validation_at > NOW() - INTERVAL '7 days'"
    } else if (period === 'month') {
      dateFilter = "AND last_validation_at > NOW() - INTERVAL '30 days'"
    }

    const query = `
      WITH user_stats AS (
        SELECT
          vs.user_id,
          u.email,
          u.name,
          vs.documents_validated,
          vs.points,
          vs.last_validation_at,
          -- Calculer badge basé sur points
          CASE
            WHEN vs.points >= 100 THEN 'or'
            WHEN vs.points >= 50 THEN 'argent'
            WHEN vs.points >= 10 THEN 'bronze'
            ELSE 'novice'
          END as badge,
          -- Calculer rang
          RANK() OVER (ORDER BY vs.points DESC) as rank
        FROM user_validation_stats vs
        INNER JOIN users u ON vs.user_id = u.id
        WHERE 1=1 ${dateFilter}
      )
      SELECT
        user_id as "userId",
        email,
        name,
        documents_validated as "documentsValidated",
        points,
        badge,
        rank,
        last_validation_at as "lastValidationAt"
      FROM user_stats
      ORDER BY rank ASC
      LIMIT $1
    `

    const result = await db.query(query, [limit])

    // Stats globales
    const statsQuery = `
      SELECT
        COUNT(DISTINCT user_id) as total_validators,
        SUM(documents_validated) as total_validations,
        SUM(points) as total_points
      FROM user_validation_stats
    `
    const statsResult = await db.query(statsQuery)
    const stats = statsResult.rows[0]

    return NextResponse.json({
      success: true,
      data: {
        leaderboard: result.rows,
        stats: {
          totalValidators: parseInt(stats.total_validators || '0', 10),
          totalValidations: parseInt(stats.total_validations || '0', 10),
          totalPoints: parseInt(stats.total_points || '0', 10),
        },
      },
    })
  } catch (error) {
    console.error('[API KB Quality Leaderboard] Erreur GET:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
