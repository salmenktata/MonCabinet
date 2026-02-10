import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'

/**
 * POST /api/admin/kb/reanalyze-all
 *
 * Lance une ré-analyse complète de tous les documents KB avec les nouveaux prompts
 * Option pour mode dry-run ou exécution réelle
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const batchSize = parseInt(body.batchSize || '20', 10)
    const dryRun = body.dryRun === true
    const category = body.category || null

    console.log('[Reanalyze All] Starting with config:', { batchSize, dryRun, category })

    // Récupérer les documents à ré-analyser
    let query = `
      SELECT id, title, category, quality_score
      FROM knowledge_base
      WHERE is_active = true
    `

    if (category) {
      query += ` AND category = '${category}'`
    }

    query += ` ORDER BY created_at DESC LIMIT ${batchSize}`

    const result = await db.query(query)
    const documents = result.rows

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document à ré-analyser',
        analyzed: 0,
        succeeded: 0,
        failed: 0,
        dryRun,
      })
    }

    if (dryRun) {
      return NextResponse.json({
        success: true,
        message: `Mode dry-run: ${documents.length} documents seraient ré-analysés`,
        documents: documents.map(d => ({
          id: d.id,
          title: d.title.substring(0, 60),
          category: d.category,
          currentScore: d.quality_score,
        })),
        dryRun: true,
      })
    }

    // Ré-analyser chaque document
    const results = []
    let succeeded = 0
    let failed = 0

    for (const doc of documents) {
      const startTime = Date.now()

      try {
        console.log(`[Reanalyze All] Analyzing "${doc.title.substring(0, 50)}"...`)

        const analysis = await analyzeKBDocumentQuality(doc.id)

        results.push({
          documentId: doc.id,
          title: doc.title.substring(0, 60),
          success: true,
          oldScore: doc.quality_score,
          newScore: analysis.qualityScore,
          improvement: analysis.qualityScore - (doc.quality_score || 0),
          processingTimeMs: Date.now() - startTime,
        })

        succeeded++
        console.log(`   ✅ ${doc.quality_score || 0} → ${analysis.qualityScore} (+${analysis.qualityScore - (doc.quality_score || 0)})`)
      } catch (error: any) {
        console.error(`[Reanalyze All] Error:`, error.message)

        results.push({
          documentId: doc.id,
          title: doc.title.substring(0, 60),
          success: false,
          error: error.message,
          processingTimeMs: Date.now() - startTime,
        })

        failed++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Ré-analyse terminée: ${succeeded}/${documents.length} réussis`,
      analyzed: documents.length,
      succeeded,
      failed,
      results,
      dryRun: false,
    })
  } catch (error: any) {
    console.error('[Reanalyze All] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de la ré-analyse',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/kb/reanalyze-all
 *
 * Retourne les statistiques de ré-analyse
 */
export async function GET() {
  try {
    const stats = await db.query(`
      SELECT
        COUNT(*) as total_docs,
        COUNT(*) FILTER (WHERE quality_score IS NOT NULL) as with_score,
        COUNT(*) FILTER (WHERE quality_score IS NULL) as without_score,
        ROUND(AVG(quality_score)) as avg_score,
        COUNT(*) FILTER (WHERE quality_score >= 80) as excellent,
        COUNT(*) FILTER (WHERE quality_score >= 60 AND quality_score < 80) as good,
        COUNT(*) FILTER (WHERE quality_score >= 40 AND quality_score < 60) as medium,
        COUNT(*) FILTER (WHERE quality_score < 40) as low
      FROM knowledge_base
      WHERE is_active = true
    `)

    return NextResponse.json({
      success: true,
      stats: {
        totalDocs: stats.rows[0].total_docs,
        withScore: stats.rows[0].with_score,
        withoutScore: stats.rows[0].without_score,
        avgScore: stats.rows[0].avg_score || 0,
        distribution: {
          excellent: stats.rows[0].excellent,
          good: stats.rows[0].good,
          medium: stats.rows[0].medium,
          low: stats.rows[0].low,
        },
      },
    })
  } catch (error: any) {
    console.error('[Reanalyze All] Error fetching stats:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    )
  }
}
