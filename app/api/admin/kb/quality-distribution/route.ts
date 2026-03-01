import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    // Requête unique avec CTEs (P4.1 Mar 2026 — remplace 4 requêtes séquentielles)
    const result = await db.query(`
      WITH scored AS (
        SELECT
          title,
          category,
          quality_score,
          quality_clarity,
          quality_structure,
          quality_completeness,
          quality_reliability,
          quality_analysis_summary
        FROM knowledge_base
        WHERE quality_score IS NOT NULL
      ),
      distribution AS (
        SELECT
          CASE
            WHEN quality_score < 20 THEN '00-19 Très faible'
            WHEN quality_score < 40 THEN '20-39 Faible'
            WHEN quality_score < 60 THEN '40-59 Moyen'
            WHEN quality_score < 80 THEN '60-79 Bon'
            ELSE '80-100 Excellent'
          END AS range,
          COUNT(*) AS count,
          ROUND(AVG(quality_score), 1) AS avg_score,
          ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
        FROM scored
        GROUP BY range
      ),
      top_scores AS (
        SELECT
          SUBSTRING(title, 1, 80) AS title,
          quality_score,
          quality_clarity,
          quality_structure,
          quality_completeness,
          quality_reliability,
          SUBSTRING(quality_analysis_summary, 1, 200) AS summary,
          ROW_NUMBER() OVER (ORDER BY quality_score DESC) AS rn
        FROM scored
      ),
      bottom_scores AS (
        SELECT
          SUBSTRING(title, 1, 80) AS title,
          quality_score,
          quality_clarity,
          quality_structure,
          quality_completeness,
          quality_reliability,
          SUBSTRING(quality_analysis_summary, 1, 200) AS summary,
          ROW_NUMBER() OVER (ORDER BY quality_score ASC) AS rn
        FROM scored
      ),
      by_category AS (
        SELECT
          category,
          COUNT(*) AS total_docs,
          ROUND(AVG(quality_score), 1) AS avg_score,
          MIN(quality_score) AS min_score,
          MAX(quality_score) AS max_score
        FROM scored
        GROUP BY category
      )
      SELECT
        'distribution' AS result_type,
        to_jsonb(d) AS data
      FROM distribution d
      UNION ALL
      SELECT 'top', to_jsonb(t) FROM top_scores t WHERE t.rn <= 5
      UNION ALL
      SELECT 'bottom', to_jsonb(b) FROM bottom_scores b WHERE b.rn <= 5
      UNION ALL
      SELECT 'category', to_jsonb(c) FROM by_category c
    `)

    const distribution: unknown[] = []
    const topScores: unknown[] = []
    const bottomScores: unknown[] = []
    const byCategory: unknown[] = []

    for (const row of result.rows) {
      const data = row.data as Record<string, unknown>
      // Supprimer la clé interne rn
      delete data.rn
      if (row.result_type === 'distribution') distribution.push(data)
      else if (row.result_type === 'top') topScores.push(data)
      else if (row.result_type === 'bottom') bottomScores.push(data)
      else if (row.result_type === 'category') byCategory.push(data)
    }

    // Trier distribution par range
    distribution.sort((a, b) => ((a as Record<string, string>).range > (b as Record<string, string>).range ? 1 : -1))
    // Trier byCategory par avg_score desc
    byCategory.sort((a, b) => Number((b as Record<string, unknown>).avg_score) - Number((a as Record<string, unknown>).avg_score))

    return NextResponse.json({
      success: true,
      distribution,
      topScores,
      bottomScores,
      byCategory,
    })
  } catch (error) {
    console.error('[Quality Distribution] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
})
