/**
 * POST /api/admin/kb/reindex-articles
 *
 * Réindexe un batch de documents codes/legislation/constitution/jort
 * avec la stratégie de chunking "article" (un chunk = un article de loi).
 *
 * Body:
 *   batchSize (default: 3)          — nombre de docs à traiter
 *   category  (optional)            — filtrer par catégorie spécifique
 *
 * Réponse:
 *   processed, succeeded, failed, remaining
 */

import { NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { db } from '@/lib/db/postgres'
import { indexKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { getErrorMessage } from '@/lib/utils/error-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const ARTICLE_CATEGORIES = ['codes', 'legislation', 'constitution', 'jort']

export const POST = withAdminApiAuth(async (request, _ctx, _session) => {
  const startTime = Date.now()

  // Enregistrer démarrage dans cron_executions
  let cronExecutionId: string | null = null
  try {
    const execResult = await db.query<{ id: string }>(`
      INSERT INTO cron_executions (cron_name, status, started_at, triggered_by)
      VALUES ('kb-article-rechunk', 'running', NOW(), 'manual')
      RETURNING id
    `)
    cronExecutionId = execResult.rows[0]?.id || null
  } catch {
    // Table peut ne pas encore avoir cette entrée — non bloquant
  }

  try {
    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(parseInt(body.batchSize || '3', 10), 10)
    const category: string | null = body.category || null

    console.log('[ReindexArticles] Démarrage:', { batchSize, category })

    // Filtrer les catégories éligibles
    const targetCategories = category
      ? (ARTICLE_CATEGORIES.includes(category) ? [category] : [])
      : ARTICLE_CATEGORIES

    if (targetCategories.length === 0) {
      return NextResponse.json({
        success: false,
        error: `Catégorie "${category}" non éligible au chunking article. Catégories valides: ${ARTICLE_CATEGORIES.join(', ')}`,
      }, { status: 400 })
    }

    // Trouver des documents avec des articles détectables, pas encore en stratégie article
    const docsResult = await db.query<{
      id: string
      title: string
      category: string
      estimated_articles: string
    }>(`
      SELECT
        kb.id,
        kb.title,
        kb.category,
        CASE
          WHEN kb.language = 'fr' THEN
            (SELECT COUNT(*) FROM regexp_matches(kb.full_text, '(?:Article|art\\.?)\\s+\\d+', 'gi'))::text
          WHEN kb.language = 'ar' THEN
            (SELECT COUNT(*) FROM regexp_matches(kb.full_text, '(?:الفصل|فصل)\\s+\\d+', 'g'))::text
          ELSE '0'
        END as estimated_articles
      FROM knowledge_base kb
      WHERE kb.is_active = true
        AND kb.category = ANY($1)
        AND kb.full_text IS NOT NULL
        AND LENGTH(kb.full_text) > 500
      ORDER BY kb.updated_at ASC
      LIMIT $2
    `, [targetCategories, batchSize])

    const docs = docsResult.rows

    // Total restant estimé
    const remainingResult = await db.query<{ count: string }>(`
      SELECT COUNT(*) as count
      FROM knowledge_base kb
      WHERE kb.is_active = true
        AND kb.category = ANY($1)
        AND kb.full_text IS NOT NULL
        AND LENGTH(kb.full_text) > 500
    `, [targetCategories])
    const remaining = parseInt(remainingResult.rows[0]?.count || '0', 10)

    if (docs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Aucun document éligible au chunking article',
        processed: 0,
        succeeded: 0,
        failed: 0,
        remaining: 0,
        duration: Date.now() - startTime,
      })
    }

    console.log(`[ReindexArticles] ${docs.length} docs, ${remaining} total dans catégories`)

    let succeeded = 0
    let failed = 0
    const results: Array<{ docId: string; title: string; success: boolean; chunksCreated?: number; error?: string }> = []

    for (const doc of docs) {
      try {
        console.log(`[ReindexArticles] Traitement "${doc.title}" (~${doc.estimated_articles} articles)`)

        const result = await indexKnowledgeDocument(doc.id, { strategy: 'article' })

        if (result.success) {
          succeeded++
          results.push({ docId: doc.id, title: doc.title, success: true, chunksCreated: result.chunksCreated })
          console.log(`[ReindexArticles] ✅ "${doc.title}" → ${result.chunksCreated} chunks`)
        } else {
          failed++
          results.push({ docId: doc.id, title: doc.title, success: false, error: result.error })
          console.error(`[ReindexArticles] ❌ "${doc.title}": ${result.error}`)
        }
      } catch (err) {
        failed++
        const msg = getErrorMessage(err)
        results.push({ docId: doc.id, title: doc.title, success: false, error: msg })
        console.error(`[ReindexArticles] ❌ "${doc.title}": ${msg}`)
      }
    }

    const duration = Date.now() - startTime

    // Mettre à jour cron_executions avec succès
    if (cronExecutionId) {
      await db.query(`
        UPDATE cron_executions
        SET status = 'success', completed_at = NOW(), duration_ms = $2,
            output = $3
        WHERE id = $1
      `, [cronExecutionId, duration, JSON.stringify({ processed: docs.length, succeeded, failed, remaining })])
        .catch(() => {})
    }

    return NextResponse.json({
      success: true,
      message: `Réindexation articles terminée: ${succeeded}/${docs.length} réussis`,
      processed: docs.length,
      succeeded,
      failed,
      remaining,
      duration,
      results,
    })
  } catch (error) {
    console.error('[ReindexArticles] Erreur:', error)

    // Mettre à jour cron_executions avec échec
    if (cronExecutionId) {
      await db.query(`
        UPDATE cron_executions
        SET status = 'error', completed_at = NOW(), duration_ms = $2, error_message = $3
        WHERE id = $1
      `, [cronExecutionId, Date.now() - startTime, getErrorMessage(error)])
        .catch(() => {})
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
