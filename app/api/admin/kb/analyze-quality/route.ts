import { NextRequest, NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { db } from '@/lib/db/postgres'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * POST /api/admin/kb/analyze-quality
 *
 * Analyse la qualité d'un batch de documents KB avec LLM
 *
 * Body params:
 * - batchSize (default: 10) - Nombre de documents à analyser
 * - category (optional) - Filtrer par catégorie
 * - sourceUrl (optional) - Filtrer par URL de source web (ex: 'cassation.tn')
 * - skipAnalyzed (default: true) - Skip documents déjà analysés
 *
 * @returns Rapport d'analyse
 */
export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json()
    const batchSize = parseInt(body.batchSize || '10', 10)
    const category = body.category || null
    const sourceUrl = body.sourceUrl || null
    const skipAnalyzed = body.skipAnalyzed !== false
    const deactivateShortDocs = body.deactivateShortDocs === true

    console.log('[KB Quality] Démarrage:', { batchSize, category, sourceUrl, skipAnalyzed, deactivateShortDocs })

    // Identifier les documents à analyser
    let query = `
      SELECT id, title, category, full_text
      FROM knowledge_base
      WHERE is_active = true
    `

    const params: any[] = []
    let paramIndex = 1

    if (category) {
      query += ` AND category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }

    if (sourceUrl) {
      query += ` AND id IN (
        SELECT ld.knowledge_base_id FROM legal_documents ld
        JOIN web_pages_documents wpd ON wpd.legal_document_id = ld.id
        JOIN web_pages wp ON wp.id = wpd.web_page_id
        JOIN web_sources ws ON ws.id = wp.web_source_id
        WHERE ws.url ILIKE $${paramIndex}
      )`
      params.push(`%${sourceUrl}%`)
      paramIndex++
    }

    if (skipAnalyzed) {
      query += ` AND quality_score IS NULL`
    }

    // skipAnalyzed=false → pagination chronologique (oldest assessed first)
    // skipAnalyzed=true  → docs jamais analysés en premier, puis les plus vieux
    query += ` ORDER BY quality_assessed_at ASC NULLS FIRST LIMIT $${paramIndex}`
    params.push(batchSize)

    const result = await db.query<{
      id: string
      title: string
      category: string
      full_text: string
    }>(query, params)

    const docsToAnalyze = result.rows

    if (docsToAnalyze.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document à analyser',
        analyzed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      })
    }

    console.log(`[KB Quality] ${docsToAnalyze.length} documents à analyser`)

    // Analyser chaque document
    const results: Array<{
      documentId: string
      title: string
      success: boolean
      qualityScore?: number
      error?: string
      processingTimeMs: number
    }> = []

    for (const doc of docsToAnalyze) {
      const startTime = Date.now()

      try {
        console.log(`[KB Quality] Analysing "${doc.title}" (${doc.id})...`)

        if (!doc.full_text || doc.full_text.length < 100) {
          // Si deactivateShortDocs=true et contenu < 50 chars, désactiver le doc
          if (deactivateShortDocs && (!doc.full_text || doc.full_text.length < 50)) {
            await db.query(
              `UPDATE knowledge_base SET is_active = false, updated_at = NOW() WHERE id = $1`,
              [doc.id]
            )
            results.push({
              documentId: doc.id,
              title: doc.title,
              success: false,
              error: `Désactivé (contenu < 50 chars: ${doc.full_text?.length || 0} chars)`,
              processingTimeMs: Date.now() - startTime,
            })
          } else {
            results.push({
              documentId: doc.id,
              title: doc.title,
              success: false,
              error: 'Full text trop court ou manquant',
              processingTimeMs: Date.now() - startTime,
            })
          }
          continue
        }

        // Analyser avec LLM
        const analysis = await analyzeKBDocumentQuality(doc.id)

        // Le service analyzeKBDocumentQuality stocke déjà le résultat
        results.push({
          documentId: doc.id,
          title: doc.title,
          success: true,
          qualityScore: analysis.qualityScore,
          processingTimeMs: Date.now() - startTime,
        })

        console.log(`   ✅ Score: ${analysis.qualityScore}/100 (${Date.now() - startTime}ms)`)
      } catch (error) {
        console.error(`[KB Quality] ❌ Erreur:`, getErrorMessage(error))

        results.push({
          documentId: doc.id,
          title: doc.title,
          success: false,
          error: getErrorMessage(error),
          processingTimeMs: Date.now() - startTime,
        })
      }
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      success: true,
      message: `Analyse terminée: ${succeeded}/${docsToAnalyze.length} réussis`,
      analyzed: docsToAnalyze.length,
      succeeded,
      failed,
      results,
    })
  } catch (error) {
    console.error('[KB Quality] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error) || 'Erreur lors de l\'analyse',
      },
      { status: 500 }
    )
  }
})

/**
 * GET /api/admin/kb/analyze-quality
 *
 * Retourne les statistiques d'analyse de qualité
 */
export const GET = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const stats = await db.query<{
      total_docs: number
      with_score: number
      without_score: number
      avg_score: number
    }>(`
      SELECT
        COUNT(*) as total_docs,
        COUNT(*) FILTER (WHERE quality_score IS NOT NULL) as with_score,
        COUNT(*) FILTER (WHERE quality_score IS NULL) as without_score,
        ROUND(AVG(quality_score)) as avg_score
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
        coverage: stats.rows[0].total_docs > 0
          ? Math.round((stats.rows[0].with_score / stats.rows[0].total_docs) * 100)
          : 0,
      },
    })
  } catch (error) {
    console.error('[KB Quality] Erreur stats:', error)
    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
      },
      { status: 500 }
    )
  }
})
