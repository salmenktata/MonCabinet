/**
 * API : Exécution du Pipeline d'Acquisition
 *
 * POST /api/admin/acquisition/execute - Lance l'acquisition pour une source
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import {
  validateDocumentQuality,
  batchValidateSourceDocuments,
  type QualityCriteria,
} from '@/lib/knowledge-base/acquisition-pipeline-service'

// =============================================================================
// POST - Exécuter l'acquisition et validation qualité
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sourceId,
      action,
      documentId,
      criteria,
    }: {
      sourceId?: string
      action: 'validate-document' | 'validate-source' | 'crawl'
      documentId?: string
      criteria?: QualityCriteria
    } = body

    // Action : Valider un document individuel
    if (action === 'validate-document') {
      if (!documentId || !criteria) {
        return NextResponse.json(
          {
            success: false,
            error: 'documentId et criteria requis pour validate-document',
          },
          { status: 400 }
        )
      }

      const validation = await validateDocumentQuality(documentId, criteria)

      return NextResponse.json({
        success: true,
        data: {
          documentId,
          validation,
        },
      })
    }

    // Action : Valider tous les documents d'une source
    if (action === 'validate-source') {
      if (!sourceId || !criteria) {
        return NextResponse.json(
          {
            success: false,
            error: 'sourceId et criteria requis pour validate-source',
          },
          { status: 400 }
        )
      }

      const validation = await batchValidateSourceDocuments(sourceId, criteria)

      return NextResponse.json({
        success: true,
        data: {
          sourceId,
          validation,
        },
      })
    }

    // Action : Lancer un crawl (délègue au cron worker existant)
    if (action === 'crawl') {
      if (!sourceId) {
        return NextResponse.json(
          {
            success: false,
            error: 'sourceId requis pour crawl',
          },
          { status: 400 }
        )
      }

      // Créer un job de crawl
      const jobQuery = `
        INSERT INTO web_crawl_jobs (
          web_source_id,
          status,
          priority
        ) VALUES ($1, 'pending', 10)
        RETURNING id
      `
      const jobResult = await db.query(jobQuery, [sourceId])
      const jobId = jobResult.rows[0].id

      return NextResponse.json({
        success: true,
        data: {
          sourceId,
          jobId,
          message: 'Job de crawl créé avec succès. Le cron worker va le traiter.',
        },
      })
    }

    return NextResponse.json(
      {
        success: false,
        error: `Action inconnue: ${action}`,
      },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API Acquisition Execute] Erreur POST:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
