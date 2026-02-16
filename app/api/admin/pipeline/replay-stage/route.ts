/**
 * API : Re-Trigger Unitaire d'une Étape
 * POST /api/admin/pipeline/replay-stage
 *
 * Body : { documentId, stage?, force?, reason? }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { replayStage } from '@/lib/pipeline/document-pipeline-service'
import { z } from 'zod'
import type { PipelineStage } from '@/lib/pipeline/document-pipeline-service'

const replaySchema = z.object({
  documentId: z.string().uuid('ID document invalide'),
  stage: z.enum([
    'crawled',
    'content_reviewed',
    'classified',
    'indexed',
    'quality_analyzed',
    'rag_active',
  ] as const).optional(),
  force: z.boolean().optional(),
  reason: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()

    // Vérification authentification et rôle (admin ou super_admin)
    const allowedRoles = ['admin', 'super_admin']
    if (!session?.user?.role || !allowedRoles.includes(session.user.role)) {
      return NextResponse.json(
        { error: 'Non autorisé - rôle admin ou super_admin requis' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = replaySchema.safeParse(body)

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

    const { documentId, stage, force, reason } = validation.data

    // Exécuter le replay
    const result = await replayStage(
      documentId,
      session.user.id,
      stage as PipelineStage | undefined,
      { force, reason }
    )

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Échec du replay',
          documentId,
          stage: result.stage,
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      stage: result.stage,
      attemptNumber: result.attemptNumber,
      duration_ms: result.duration_ms,
      message: `Étape "${result.stage}" rejouée avec succès`,
    })
  } catch (error) {
    console.error('Erreur API /pipeline/replay-stage:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur lors du replay',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
