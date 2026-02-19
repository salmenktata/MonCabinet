import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    // 1. Distribution générale
    const dist = await db.query(`
      SELECT
        CASE
          WHEN quality_score < 20 THEN '00-19 Très faible'
          WHEN quality_score < 40 THEN '20-39 Faible'
          WHEN quality_score < 60 THEN '40-59 Moyen'
          WHEN quality_score < 80 THEN '60-79 Bon'
          ELSE '80-100 Excellent'
        END as range,
        COUNT(*) as count,
        ROUND(AVG(quality_score), 1) as avg_score,
        ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as pct
      FROM knowledge_base
      WHERE quality_score IS NOT NULL
      GROUP BY range
      ORDER BY range
    `)

    // 2. Top 5 meilleurs
    const top = await db.query(`
      SELECT
        SUBSTRING(title, 1, 80) as title,
        quality_score,
        quality_clarity,
        quality_structure,
        quality_completeness,
        quality_reliability,
        SUBSTRING(quality_analysis_summary, 1, 200) as summary
      FROM knowledge_base
      WHERE quality_score IS NOT NULL
      ORDER BY quality_score DESC
      LIMIT 5
    `)

    // 3. Bottom 5 pires
    const bottom = await db.query(`
      SELECT
        SUBSTRING(title, 1, 80) as title,
        quality_score,
        quality_clarity,
        quality_structure,
        quality_completeness,
        quality_reliability,
        SUBSTRING(quality_analysis_summary, 1, 200) as summary
      FROM knowledge_base
      WHERE quality_score IS NOT NULL
      ORDER BY quality_score ASC
      LIMIT 5
    `)

    // 4. Par catégorie
    const cat = await db.query(`
      SELECT
        category,
        COUNT(*) as total_docs,
        ROUND(AVG(quality_score), 1) as avg_score,
        MIN(quality_score) as min_score,
        MAX(quality_score) as max_score
      FROM knowledge_base
      WHERE quality_score IS NOT NULL
      GROUP BY category
      ORDER BY avg_score DESC
    `)

    return NextResponse.json({
      success: true,
      distribution: dist.rows,
      topScores: top.rows,
      bottomScores: bottom.rows,
      byCategory: cat.rows,
    })
  } catch (error) {
    console.error('[Quality Distribution] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
