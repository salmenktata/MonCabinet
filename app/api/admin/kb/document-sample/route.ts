import { getErrorMessage } from '@/lib/utils/error-utils'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const scoreRange = searchParams.get('range') || 'low' // low, medium, high

  try {
    let query = ''

    if (scoreRange === 'low') {
      // Document avec score faible (20-39)
      query = `
        SELECT
          id, title, category, language,
          quality_score, quality_clarity, quality_structure,
          quality_completeness, quality_reliability,
          quality_analysis_summary,
          SUBSTRING(full_text, 1, 2000) as full_text_sample,
          LENGTH(full_text) as full_text_length
        FROM knowledge_base
        WHERE quality_score BETWEEN 20 AND 39
        ORDER BY quality_score ASC
        LIMIT 1
      `
    } else if (scoreRange === 'medium') {
      // Document avec score moyen (40-59)
      query = `
        SELECT
          id, title, category, language,
          quality_score, quality_clarity, quality_structure,
          quality_completeness, quality_reliability,
          quality_analysis_summary,
          SUBSTRING(full_text, 1, 2000) as full_text_sample,
          LENGTH(full_text) as full_text_length
        FROM knowledge_base
        WHERE quality_score BETWEEN 40 AND 59
        ORDER BY quality_score DESC
        LIMIT 1
      `
    } else if (scoreRange === 'high') {
      // Document avec meilleur score (60+)
      query = `
        SELECT
          id, title, category, language,
          quality_score, quality_clarity, quality_structure,
          quality_completeness, quality_reliability,
          quality_analysis_summary,
          SUBSTRING(full_text, 1, 2000) as full_text_sample,
          LENGTH(full_text) as full_text_length
        FROM knowledge_base
        WHERE quality_score >= 60
        ORDER BY quality_score DESC
        LIMIT 1
      `
    }

    const result = await db.query(query)

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No document found for this range',
      })
    }

    return NextResponse.json({
      success: true,
      document: result.rows[0],
    })
  } catch (error) {
    console.error('[Document Sample] Error:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}
