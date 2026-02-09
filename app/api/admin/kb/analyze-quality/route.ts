import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'

/**
 * POST /api/admin/kb/analyze-quality
 *
 * Analyse la qualité des documents KB par batch
 *
 * Body params:
 * - batchSize (default: 10) - Nombre de documents à analyser par batch
 * - category (optional) - Filtrer par catégorie
 * - skipAnalyzed (default: true) - Sauter les documents déjà analysés
 *
 * @returns Rapport d'analyse avec nombre de docs traités, réussis, échoués
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const batchSize = parseInt(body.batchSize || '10', 10)
    const category = body.category || null
    const skipAnalyzed = body.skipAnalyzed !== false

    console.log('[KB Quality Analysis] Démarrage analyse batch:', {
      batchSize,
      category,
      skipAnalyzed,
    })

    // Récupérer les documents à analyser
    let query = `
      SELECT id, title, category
      FROM knowledge_base
      WHERE is_active = true
    `
    const params: (string | number)[] = []
    let paramIndex = 1

    // Filtrer par catégorie si spécifié
    if (category && category !== 'all') {
      query += ` AND category = $${paramIndex++}`
      params.push(category)
    }

    // Sauter les documents déjà analysés (quality_score NOT NULL)
    if (skipAnalyzed) {
      query += ` AND quality_score IS NULL`
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`
    params.push(batchSize)

    const docsResult = await db.query<{
      id: string
      title: string
      category: string
    }>(query, params)

    const totalDocs = docsResult.rows.length

    if (totalDocs === 0) {
      return NextResponse.json({
        success: true,
        message: skipAnalyzed
          ? 'Aucun document à analyser (tous déjà analysés)'
          : 'Aucun document trouvé',
        analyzed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      })
    }

    console.log(`[KB Quality Analysis] ${totalDocs} documents à analyser`)

    // Analyser chaque document
    const results: Array<{
      documentId: string
      title: string
      category: string
      success: boolean
      qualityScore?: number
      error?: string
      processingTimeMs?: number
    }> = []

    let succeeded = 0
    let failed = 0

    for (const doc of docsResult.rows) {
      const startTime = Date.now()
      try {
        console.log(`[KB Quality Analysis] Analyse de "${doc.title}" (${doc.id})...`)

        const qualityResult = await analyzeKBDocumentQuality(doc.id)

        results.push({
          documentId: doc.id,
          title: doc.title,
          category: doc.category,
          success: true,
          qualityScore: qualityResult.qualityScore,
          processingTimeMs: Date.now() - startTime,
        })

        succeeded++

        console.log(
          `[KB Quality Analysis] ✅ "${doc.title}" analysé : score ${qualityResult.qualityScore}/100 (${Date.now() - startTime}ms)`
        )
      } catch (error: any) {
        results.push({
          documentId: doc.id,
          title: doc.title,
          category: doc.category,
          success: false,
          error: error.message || 'Erreur inconnue',
          processingTimeMs: Date.now() - startTime,
        })

        failed++

        console.error(
          `[KB Quality Analysis] ❌ Erreur analyse "${doc.title}":`,
          error.message
        )
      }
    }

    const totalTime = results.reduce((sum, r) => sum + (r.processingTimeMs || 0), 0)
    const avgTime = Math.round(totalTime / totalDocs)

    console.log(`[KB Quality Analysis] Terminé : ${succeeded}/${totalDocs} réussis, ${failed} échoués (${totalTime}ms total, ${avgTime}ms moy.)`)

    return NextResponse.json({
      success: true,
      message: `Analyse terminée : ${succeeded}/${totalDocs} réussis`,
      analyzed: totalDocs,
      succeeded,
      failed,
      avgProcessingTimeMs: avgTime,
      results,
    })
  } catch (error: any) {
    console.error('[KB Quality Analysis] Erreur :', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de l\'analyse',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/kb/analyze-quality
 *
 * Récupère les statistiques d'analyse de qualité
 *
 * @returns Stats : total docs, avec score, sans score, distribution scores
 */
export async function GET(request: NextRequest) {
  try {
    const statsResult = await db.query<{
      total_docs: number
      with_score: number
      without_score: number
      avg_score: number
      min_score: number
      max_score: number
      excellent_count: number
      review_count: number
      reject_count: number
    }>(`
      SELECT
        COUNT(*) as total_docs,
        COUNT(quality_score) as with_score,
        COUNT(*) - COUNT(quality_score) as without_score,
        ROUND(AVG(quality_score), 1) as avg_score,
        MIN(quality_score) as min_score,
        MAX(quality_score) as max_score,
        COUNT(*) FILTER (WHERE quality_score >= 80) as excellent_count,
        COUNT(*) FILTER (WHERE quality_score BETWEEN 60 AND 79) as review_count,
        COUNT(*) FILTER (WHERE quality_score < 60) as reject_count
      FROM knowledge_base
      WHERE is_active = true
    `)

    const stats = statsResult.rows[0]

    // Distribution par catégorie
    const categoryStatsResult = await db.query<{
      category: string
      total_docs: number
      with_score: number
      avg_score: number
    }>(`
      SELECT
        category,
        COUNT(*) as total_docs,
        COUNT(quality_score) as with_score,
        ROUND(AVG(quality_score), 1) as avg_score
      FROM knowledge_base
      WHERE is_active = true
      GROUP BY category
      ORDER BY category
    `)

    return NextResponse.json({
      success: true,
      stats: {
        totalDocs: parseInt(stats.total_docs),
        withScore: parseInt(stats.with_score),
        withoutScore: parseInt(stats.without_score),
        coveragePct: Math.round(
          (parseInt(stats.with_score) / parseInt(stats.total_docs)) * 100
        ),
        avgScore: parseFloat(stats.avg_score) || null,
        minScore: parseFloat(stats.min_score) || null,
        maxScore: parseFloat(stats.max_score) || null,
        distribution: {
          excellent: parseInt(stats.excellent_count),
          review: parseInt(stats.review_count),
          reject: parseInt(stats.reject_count),
        },
      },
      byCategory: categoryStatsResult.rows.map((row) => ({
        category: row.category,
        totalDocs: parseInt(row.total_docs),
        withScore: parseInt(row.with_score),
        coveragePct: Math.round(
          (parseInt(row.with_score) / parseInt(row.total_docs)) * 100
        ),
        avgScore: parseFloat(row.avg_score) || null,
      })),
    })
  } catch (error: any) {
    console.error('[KB Quality Analysis] Erreur stats :', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de la récupération des stats',
      },
      { status: 500 }
    )
  }
}
