/**
 * GET /api/admin/iort/index-kb
 *
 * Indexation parallèle des documents IORT (iort_gov_tn) déjà crawlés.
 * Priorise : codes → legislation → constitution → autres
 * Utilise Promise.allSettled avec concurrence configurable (défaut=2, max=3).
 *
 * Paramètres :
 *   ?concurrency=2    Nombre de docs traités en parallèle (défaut=2, max=3)
 *   ?maxBatches=50    Nombre max de rounds (défaut=50)
 *   ?dryRun=true      Liste les docs sans indexer
 *
 * Auth : session admin OU X-Cron-Secret
 */

import { NextRequest, NextResponse } from 'next/server'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'
import { indexKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import { adaptiveSleep, waitForSafeLoad } from '@/lib/system/load-guard'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const IORT_BATCH_DELAY_MS = 300

export const GET = withAdminApiAuth(async (request: NextRequest): Promise<NextResponse> => {
  const { searchParams } = new URL(request.url)
  const concurrency = Math.min(parseInt(searchParams.get('concurrency') || '2', 10), 3)
  const maxBatches = parseInt(searchParams.get('maxBatches') || '50', 10)
  const dryRun = searchParams.get('dryRun') === 'true'

  const pageSize = concurrency * 10 // Charger plusieurs batches d'avance
  const startTime = Date.now()
  let totalIndexed = 0
  let totalFailed = 0
  let batchCount = 0

  console.log(`[IORTIndexKB] Démarrage — concurrence=${concurrency}, maxBatches=${maxBatches}${dryRun ? ' [DRY RUN]' : ''}`)

  // Dry run : liste uniquement les docs IORT en attente
  if (dryRun) {
    const result = await db.query(
      `SELECT kb.id, kb.title, kb.category, kb.quality_score,
              kb.metadata->>'sourceOrigin' AS source_origin,
              kb.created_at
       FROM knowledge_base kb
       WHERE kb.is_indexed = false
         AND kb.full_text IS NOT NULL
         AND (kb.last_index_error IS NULL OR kb.last_index_attempt_at < NOW() - INTERVAL '1 hour')
         AND (
           kb.metadata->>'sourceOrigin' = 'iort_gov_tn'
           OR EXISTS (
             SELECT 1 FROM web_pages wp
             JOIN web_sources ws ON wp.web_source_id = ws.id
             WHERE wp.knowledge_base_id = kb.id
               AND ws.base_url ILIKE '%iort%'
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM web_pages wp
           JOIN web_sources ws ON wp.web_source_id = ws.id
           WHERE wp.knowledge_base_id = kb.id AND ws.rag_enabled = false
         )
       ORDER BY
         CASE WHEN kb.category = 'codes' THEN 1
              WHEN kb.category = 'legislation' THEN 2
              WHEN kb.category = 'constitution' THEN 3
              ELSE 4 END,
         COALESCE(kb.quality_assessed_at, kb.created_at) ASC
       LIMIT 500`,
      []
    )
    const byCategory = result.rows.reduce((acc: Record<string, number>, row: { category: string }) => {
      acc[row.category] = (acc[row.category] || 0) + 1
      return acc
    }, {})
    return NextResponse.json({
      dryRun: true,
      pending: result.rows.length,
      byCategory,
      docs: result.rows.map((r: { id: string; title: string; category: string; quality_score: number | null }) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        quality_score: r.quality_score,
      })),
    })
  }

  // Indexation réelle par rounds successifs
  for (let round = 0; round < maxBatches; round++) {
    const pendingResult = await db.query(
      `SELECT kb.id, kb.title, kb.category
       FROM knowledge_base kb
       WHERE kb.is_indexed = false
         AND kb.full_text IS NOT NULL
         AND (kb.last_index_error IS NULL OR kb.last_index_attempt_at < NOW() - INTERVAL '1 hour')
         AND (
           kb.metadata->>'sourceOrigin' = 'iort_gov_tn'
           OR EXISTS (
             SELECT 1 FROM web_pages wp
             JOIN web_sources ws ON wp.web_source_id = ws.id
             WHERE wp.knowledge_base_id = kb.id
               AND ws.base_url ILIKE '%iort%'
           )
         )
         AND NOT EXISTS (
           SELECT 1 FROM web_pages wp
           JOIN web_sources ws ON wp.web_source_id = ws.id
           WHERE wp.knowledge_base_id = kb.id AND ws.rag_enabled = false
         )
       ORDER BY
         CASE WHEN kb.category = 'codes' THEN 1
              WHEN kb.category = 'legislation' THEN 2
              WHEN kb.category = 'constitution' THEN 3
              ELSE 4 END,
         COALESCE(kb.quality_assessed_at, kb.created_at) ASC
       LIMIT $1`,
      [pageSize]
    )

    const rows = pendingResult.rows
    if (rows.length === 0) {
      console.log(`[IORTIndexKB] Plus de documents IORT à indexer après ${round} rounds`)
      break
    }

    // Traitement par micro-batches parallèles
    for (let i = 0; i < rows.length; i += concurrency) {
      const microBatch = rows.slice(i, i + concurrency)

      const settled = await Promise.allSettled(
        microBatch.map((row: { id: string }) => indexKnowledgeDocument(row.id))
      )

      // Marquer succès/échec en DB
      await Promise.all(
        settled.map(async (result, idx) => {
          const row = microBatch[idx]
          if (result.status === 'fulfilled' && result.value.success) {
            totalIndexed++
            await db.query(
              `UPDATE knowledge_base SET last_index_error = NULL, last_index_attempt_at = NOW() WHERE id = $1`,
              [row.id]
            ).catch(() => {})
          } else {
            totalFailed++
            const errorMsg = result.status === 'rejected'
              ? (result.reason instanceof Error ? result.reason.message : 'Erreur inconnue')
              : (result.value.error || 'Échec indexation')
            await db.query(
              `UPDATE knowledge_base SET last_index_error = $2, last_index_attempt_at = NOW() WHERE id = $1`,
              [row.id, errorMsg.substring(0, 500)]
            ).catch(() => {})
          }
        })
      )

      batchCount++
      console.log(
        `[IORTIndexKB] Round ${round + 1} micro-batch ${Math.floor(i / concurrency) + 1}: ` +
        `+${settled.filter(r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<{ success: boolean }>).value.success).length} indexés — ` +
        `total=${totalIndexed} échoués=${totalFailed}`
      )

      // Load guard entre chaque micro-batch
      const loadLevel = await adaptiveSleep(IORT_BATCH_DELAY_MS)
      if (loadLevel === 'overloaded') {
        const safe = await waitForSafeLoad(30_000)
        if (!safe) {
          console.warn('[IORTIndexKB] Serveur surchargé >30s — arrêt anticipé')
          return NextResponse.json({
            success: true,
            stoppedEarly: true,
            indexed: totalIndexed,
            failed: totalFailed,
            duration: Date.now() - startTime,
          })
        }
      }
    }
  }

  const duration = Date.now() - startTime
  const docsPerMinute = totalIndexed > 0 ? Math.round((totalIndexed / duration) * 60000) : 0

  console.log(`[IORTIndexKB] Terminé — ${totalIndexed} indexés, ${totalFailed} échoués en ${Math.round(duration / 1000)}s (${docsPerMinute} docs/min)`)

  return NextResponse.json({
    success: true,
    indexed: totalIndexed,
    failed: totalFailed,
    duration,
    docsPerMinute,
    concurrency,
    rounds: batchCount,
  })
}, { allowCronSecret: true })
