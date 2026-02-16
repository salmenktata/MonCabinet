/**
 * API : Historique des Tentatives de Retry
 * GET /api/admin/pipeline/retry-attempts/[documentId]
 *
 * Retourne toutes les tentatives de retry pour un document, agrégées par étape
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getDocumentRetryAttempts } from '@/lib/pipeline/pipeline-retry-service'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
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

    const params = await context.params
    const { documentId } = params

    // Validation UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(documentId)) {
      return NextResponse.json(
        { error: 'ID document invalide (format UUID requis)' },
        { status: 400 }
      )
    }

    // Récupérer toutes les tentatives
    const attempts = await getDocumentRetryAttempts(documentId)

    // Agréger par étape
    const byStage: Record<string, any> = {}

    attempts.forEach((attempt) => {
      if (!byStage[attempt.stage]) {
        byStage[attempt.stage] = {
          stage: attempt.stage,
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          running: 0,
          lastAttempt: null,
          attempts: [],
        }
      }

      const stageData = byStage[attempt.stage]

      stageData.total++
      if (attempt.status === 'success') stageData.succeeded++
      if (attempt.status === 'failed') stageData.failed++
      if (attempt.status === 'pending') stageData.pending++
      if (attempt.status === 'running') stageData.running++

      // Garder la tentative la plus récente
      if (
        !stageData.lastAttempt ||
        new Date(attempt.triggered_at) > new Date(stageData.lastAttempt.triggered_at)
      ) {
        stageData.lastAttempt = attempt
      }

      stageData.attempts.push(attempt)
    })

    // Trier les tentatives par date décroissante dans chaque stage
    Object.values(byStage).forEach((stageData: any) => {
      stageData.attempts.sort(
        (a: any, b: any) =>
          new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime()
      )
    })

    return NextResponse.json({
      documentId,
      totalAttempts: attempts.length,
      byStage: Object.values(byStage),
      allAttempts: attempts.sort(
        (a, b) => new Date(b.triggered_at).getTime() - new Date(a.triggered_at).getTime()
      ),
    })
  } catch (error) {
    console.error('Erreur API /pipeline/retry-attempts:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : 'Erreur inconnue',
      },
      { status: 500 }
    )
  }
}
