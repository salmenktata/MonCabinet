import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { analyzeKBDocumentQuality } from '@/lib/ai/kb-quality-analyzer-service'
import { getSession } from '@/lib/auth/session'

/**
 * POST /api/admin/kb/reanalyze-failed
 *
 * Réanalyse les documents KB échoués (score = 50) avec OpenAI
 *
 * Body:
 * - limit: number (défaut: 50)
 * - dryRun: boolean (défaut: false)
 *
 * Headers:
 * - X-Cron-Secret: Secret pour authentification cron (optionnel si session admin)
 */
export async function POST(request: NextRequest) {
  try {
    // Vérifier authentification admin ou cron secret
    const cronSecret = request.headers.get('X-Cron-Secret')
    const isValidCron = cronSecret === process.env.CRON_SECRET

    if (!isValidCron) {
      const session = await getSession()
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      }

      const userResult = await db.query('SELECT role FROM users WHERE id = $1', [session.user.id])
      const role = userResult.rows[0]?.role
      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
      }
    }

    const body = await request.json()
    const limit = body.limit || 50
    const dryRun = body.dryRun || false

    console.log(`[Reanalyze Failed] Mode: ${dryRun ? 'DRY RUN' : 'EXECUTION'}, Limite: ${limit}`)

    // 1. Récupérer les documents échoués
    const result = await db.query(`
      SELECT
        id,
        title,
        category,
        LENGTH(COALESCE(full_text, '')) as text_length,
        quality_llm_provider,
        quality_score
      FROM knowledge_base
      WHERE is_active = true
        AND quality_score = 50
      ORDER BY
        CASE
          WHEN quality_llm_provider = 'ollama' THEN 1
          WHEN quality_llm_provider = 'gemini' THEN 2
          ELSE 3
        END,
        quality_assessed_at ASC
      LIMIT $1
    `, [limit])

    const docs = result.rows

    if (docs.length === 0) {
      return NextResponse.json({
        message: 'Aucun document échoué trouvé',
        processed: 0,
      })
    }

    const stats = {
      total: docs.length,
      ollama: docs.filter(d => d.quality_llm_provider === 'ollama').length,
      gemini: docs.filter(d => d.quality_llm_provider === 'gemini').length,
      other: docs.filter(d => !['ollama', 'gemini'].includes(d.quality_llm_provider || '')).length,
    }

    console.log(`[Reanalyze Failed] ${docs.length} documents trouvés:`, stats)

    if (dryRun) {
      return NextResponse.json({
        message: 'Mode DRY RUN - Aperçu seulement',
        stats,
        preview: docs.slice(0, 10).map(d => ({
          id: d.id,
          title: d.title.substring(0, 50),
          length: d.text_length,
          provider: d.quality_llm_provider,
          score: d.quality_score,
        })),
      })
    }

    // 2. Réanalyser en batch (max 50 pour éviter timeout)
    const actualLimit = Math.min(limit, 50)
    const toProcess = docs.slice(0, actualLimit)

    let succeeded = 0
    let failed = 0
    let improved = 0

    for (const doc of toProcess) {
      try {
        console.log(`[Reanalyze Failed] Analyse ${doc.id} (${doc.title.substring(0, 30)}...)`)

        const analysisResult = await analyzeKBDocumentQuality(doc.id)

        if (analysisResult.success) {
          succeeded++

          const improvement = analysisResult.quality_score - doc.quality_score
          if (improvement > 0) {
            improved++
            console.log(
              `[Reanalyze Failed] ✅ ${doc.id}: ${doc.quality_llm_provider}(${doc.quality_score}) → ${analysisResult.quality_llm_provider}(${analysisResult.quality_score}) (+${improvement})`
            )
          } else {
            console.log(
              `[Reanalyze Failed] ⚠️  ${doc.id}: ${analysisResult.quality_llm_provider}(${analysisResult.quality_score}) (pas d'amélioration)`
            )
          }
        } else {
          failed++
          console.error(`[Reanalyze Failed] ❌ ${doc.id}: ${analysisResult.error}`)
        }

        // Pause 1s entre chaque analyse (rate limiting)
        await new Promise(resolve => setTimeout(resolve, 1000))

      } catch (error) {
        failed++
        console.error(
          `[Reanalyze Failed] ❌ ${doc.id} Exception:`,
          error instanceof Error ? error.message : String(error)
        )
      }
    }

    const successRate = ((succeeded / toProcess.length) * 100).toFixed(1)
    const improvementRate = ((improved / toProcess.length) * 100).toFixed(1)

    console.log(`[Reanalyze Failed] Terminé: ${succeeded}/${toProcess.length} succès (${successRate}%), ${improved} améliorés (${improvementRate}%)`)

    return NextResponse.json({
      message: 'Réanalyse terminée',
      stats: {
        total: docs.length,
        processed: toProcess.length,
        succeeded,
        failed,
        improved,
        successRate: parseFloat(successRate),
        improvementRate: parseFloat(improvementRate),
      },
      breakdown: stats,
    })

  } catch (error: any) {
    console.error('[Reanalyze Failed] Erreur:', error)
    return NextResponse.json(
      {
        error: error.message || 'Erreur lors de la réanalyse',
      },
      { status: 500 }
    )
  }
}
