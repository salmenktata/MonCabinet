import { NextResponse } from 'next/server'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

/**
 * GET /api/admin/kb/gdrive-quality
 *
 * Retourne les statistiques de qualité pour les documents Google Drive
 */
export const GET = withAdminApiAuth(async (_request, _ctx, _session) => {
  try {
    const statsResult = await db.query<{
      total: string
      analyzed: string
      rag_enabled_count: string
      avg_score: string
      excellent: string
      good: string
      average: string
      poor: string
    }>(`
      SELECT
        COUNT(*) as total,
        COUNT(quality_score) as analyzed,
        SUM(CASE WHEN rag_enabled = true THEN 1 ELSE 0 END) as rag_enabled_count,
        ROUND(AVG(quality_score)) as avg_score,
        SUM(CASE WHEN quality_score >= 80 THEN 1 ELSE 0 END) as excellent,
        SUM(CASE WHEN quality_score >= 60 AND quality_score < 80 THEN 1 ELSE 0 END) as good,
        SUM(CASE WHEN quality_score >= 40 AND quality_score < 60 THEN 1 ELSE 0 END) as average,
        SUM(CASE WHEN quality_score < 40 AND quality_score IS NOT NULL THEN 1 ELSE 0 END) as poor
      FROM knowledge_base
      WHERE category = 'google_drive' AND is_active = true
    `)

    const row = statsResult.rows[0]
    const total = parseInt(row.total) || 0
    const analyzed = parseInt(row.analyzed) || 0

    // Top 10 meilleurs documents
    const topDocsResult = await db.query<{
      id: string
      title: string
      quality_score: number
      quality_analysis_summary: string
      rag_enabled: boolean
    }>(`
      SELECT id, title, quality_score, quality_analysis_summary, rag_enabled
      FROM knowledge_base
      WHERE category = 'google_drive'
        AND is_active = true
        AND quality_score IS NOT NULL
      ORDER BY quality_score DESC
      LIMIT 10
    `)

    // 5 pires documents (avec score)
    const lowDocsResult = await db.query<{
      id: string
      title: string
      quality_score: number
      quality_analysis_summary: string
      quality_detected_issues: string[]
    }>(`
      SELECT id, title, quality_score, quality_analysis_summary, quality_detected_issues
      FROM knowledge_base
      WHERE category = 'google_drive'
        AND is_active = true
        AND quality_score IS NOT NULL
      ORDER BY quality_score ASC
      LIMIT 5
    `)

    return NextResponse.json({
      success: true,
      stats: {
        total,
        analyzed,
        unanalyzed: total - analyzed,
        ragEnabled: parseInt(row.rag_enabled_count) || 0,
        avgScore: parseInt(row.avg_score as unknown as string) || 0,
        coverage: total > 0 ? Math.round((analyzed / total) * 100) : 0,
        distribution: {
          excellent: parseInt(row.excellent) || 0,
          good: parseInt(row.good) || 0,
          average: parseInt(row.average) || 0,
          poor: parseInt(row.poor) || 0,
        },
      },
      topDocs: topDocsResult.rows,
      lowDocs: lowDocsResult.rows,
    })
  } catch (error) {
    console.error('[GDrive Quality] Erreur stats:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })

/**
 * POST /api/admin/kb/gdrive-quality
 *
 * Actions sur les documents Google Drive :
 * - analyze : Lance l'analyse qualité LLM sur les docs non-scorés
 * - enable  : Active le RAG pour les docs avec quality_score >= minQualityScore
 * - disable : Désactive le RAG pour tous les docs Google Drive
 *
 * Body params:
 * - action: 'analyze' | 'enable' | 'disable'
 * - minQualityScore: number (pour action=enable, défaut 60)
 * - batchSize: number (pour action=analyze, défaut 20)
 */
export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action as 'analyze' | 'enable' | 'disable'

    if (!action || !['analyze', 'enable', 'disable'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action doit être analyze, enable ou disable' },
        { status: 400 }
      )
    }

    if (action === 'disable') {
      const result = await db.query<{ count: string }>(
        `UPDATE knowledge_base
         SET rag_enabled = false, updated_at = NOW()
         WHERE category = 'google_drive' AND is_active = true AND rag_enabled = true
         RETURNING id`
      )
      const affected = result.rowCount || 0
      console.log(`[GDrive Quality] RAG désactivé pour ${affected} documents`)
      return NextResponse.json({
        success: true,
        action: 'disable',
        affected,
        message: `RAG désactivé pour ${affected} document(s) Google Drive`,
      })
    }

    if (action === 'enable') {
      const minScore = parseInt(body.minQualityScore || '60', 10)

      if (minScore < 0 || minScore > 100) {
        return NextResponse.json(
          { success: false, error: 'minQualityScore doit être entre 0 et 100' },
          { status: 400 }
        )
      }

      const result = await db.query(
        `UPDATE knowledge_base
         SET rag_enabled = true, updated_at = NOW()
         WHERE category = 'google_drive'
           AND is_active = true
           AND quality_score >= $1
         RETURNING id`,
        [minScore]
      )
      const affected = result.rowCount || 0
      console.log(`[GDrive Quality] RAG activé pour ${affected} docs (seuil=${minScore})`)
      return NextResponse.json({
        success: true,
        action: 'enable',
        affected,
        minScore,
        message: `RAG activé pour ${affected} document(s) avec score ≥ ${minScore}`,
      })
    }

    // action === 'analyze'
    const batchSize = Math.min(parseInt(body.batchSize || '20', 10), 50)

    // Récupérer docs non-analysés
    const docsResult = await db.query<{
      id: string
      title: string
      full_text: string
    }>(`
      SELECT id, title, full_text
      FROM knowledge_base
      WHERE category = 'google_drive'
        AND is_active = true
        AND quality_score IS NULL
      ORDER BY created_at ASC
      LIMIT $1
    `, [batchSize])

    const docs = docsResult.rows

    if (docs.length === 0) {
      return NextResponse.json({
        success: true,
        action: 'analyze',
        message: 'Tous les documents Google Drive ont déjà été analysés',
        analyzed: 0,
        succeeded: 0,
        failed: 0,
        results: [],
      })
    }

    console.log(`[GDrive Quality] Analyse de ${docs.length} documents Drive...`)

    const { analyzeKBDocumentQuality } = await import('@/lib/ai/kb-quality-analyzer-service')

    const results: Array<{
      documentId: string
      title: string
      success: boolean
      qualityScore?: number
      error?: string
      processingTimeMs: number
    }> = []

    for (const doc of docs) {
      const startTime = Date.now()
      try {
        if (!doc.full_text || doc.full_text.length < 100) {
          results.push({
            documentId: doc.id,
            title: doc.title,
            success: false,
            error: 'Contenu insuffisant',
            processingTimeMs: Date.now() - startTime,
          })
          continue
        }

        const analysis = await analyzeKBDocumentQuality(doc.id)
        results.push({
          documentId: doc.id,
          title: doc.title,
          success: true,
          qualityScore: analysis.qualityScore,
          processingTimeMs: Date.now() - startTime,
        })
        console.log(`  ✅ "${doc.title}" → ${analysis.qualityScore}/100`)
      } catch (error) {
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
      action: 'analyze',
      analyzed: docs.length,
      succeeded,
      failed,
      message: `Analyse terminée : ${succeeded}/${docs.length} réussis`,
      results,
    })
  } catch (error) {
    console.error('[GDrive Quality] Erreur:', error)
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
