/**
 * API : Re-Trigger Batch (Actions en Masse)
 * POST /api/admin/pipeline/batch-replay
 *
 * Body : { stage, filters?, documentIds?, limit?, dryRun? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDocumentsByFilters } from '@/lib/pipeline/pipeline-stats-service'
import { replayStage } from '@/lib/pipeline/document-pipeline-service'
import { z } from 'zod'
import type { PipelineStage } from '@/lib/pipeline/document-pipeline-service'

const batchReplaySchema = z.object({
  stage: z.enum([
    'crawled',
    'content_reviewed',
    'classified',
    'indexed',
    'quality_analyzed',
    'rag_active',
  ] as const),
  filters: z.object({
    category: z.string().optional(),
    source: z.string().uuid().optional(),
    scoreRange: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }).optional(),
    dateRange: z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional(),
    onlyFailed: z.boolean().optional(),
  }).optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  limit: z.number().min(1).max(100).default(20),
  dryRun: z.boolean().default(false),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()

    if (!session?.user || session.user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Non autorisé - rôle super_admin requis' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = batchReplaySchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Données invalides',
          details: validation.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }

    const { stage, filters, documentIds, limit, dryRun } = validation.data

    // Récupérer les documents à traiter
    let documents
    if (documentIds && documentIds.length > 0) {
      // Mode : Liste explicite d'IDs
      const { db } = await import('@/lib/db/postgres')
      const result = await db.query(
        `SELECT id, title, category, quality_score, pipeline_stage
         FROM knowledge_base
         WHERE id = ANY($1) AND pipeline_stage = $2 AND is_active = true
         LIMIT $3`,
        [documentIds, stage, limit]
      )
      documents = result.rows
    } else {
      // Mode : Filtres avancés
      documents = await getDocumentsByFilters(stage, filters || {}, limit)
    }

    // DRY RUN : Retourner preview sans exécuter
    if (dryRun) {
      return NextResponse.json({
        batchId: null,
        totalMatched: documents.length,
        totalProcessed: 0,
        succeeded: 0,
        failed: 0,
        preview: documents.slice(0, 5).map((d: any) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          score: d.quality_score,
          stage: d.pipeline_stage,
        })),
        fullList: documents.map((d: any) => ({
          id: d.id,
          title: d.title,
        })),
      })
    }

    // EXÉCUTION RÉELLE
    const batchId = crypto.randomUUID()
    const results = []
    let succeeded = 0
    let failed = 0
    const startTime = Date.now()

    console.log(`[Batch ${batchId}] Démarrage replay de ${documents.length} documents sur étape "${stage}"`)

    for (const doc of documents) {
      const docStartTime = Date.now()
      try {
        const result = await replayStage(doc.id, session.user.id, stage as PipelineStage, {
          reason: `Batch replay ${batchId}`,
        })

        results.push({
          documentId: doc.id,
          title: doc.title,
          success: result.success,
          attemptNumber: result.attemptNumber,
          duration_ms: result.duration_ms,
          error: result.error,
        })

        if (result.success) {
          succeeded++
          console.log(`[Batch ${batchId}] ✅ ${doc.title} (${Date.now() - docStartTime}ms)`)
        } else {
          failed++
          console.error(`[Batch ${batchId}] ❌ ${doc.title}: ${result.error}`)
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Erreur inconnue'
        results.push({
          documentId: doc.id,
          title: doc.title,
          success: false,
          error: errMsg,
        })
        failed++
        console.error(`[Batch ${batchId}] ❌ ${doc.title}: ${errMsg}`)
      }

      // Pause de 100ms entre chaque document pour éviter de saturer
      if (documents.indexOf(doc) < documents.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const totalDuration = Date.now() - startTime
    console.log(
      `[Batch ${batchId}] Terminé en ${totalDuration}ms: ${succeeded} succès, ${failed} échecs`
    )

    return NextResponse.json({
      batchId,
      totalMatched: documents.length,
      totalProcessed: results.length,
      succeeded,
      failed,
      duration_ms: totalDuration,
      results,
    })
  } catch (error) {
    console.error('Erreur API /pipeline/batch-replay:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur lors du batch replay',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
