/**
 * GET /api/admin/monitoring/drift
 *
 * Détection de drift RAG : compare les métriques de la période récente
 * avec la période précédente pour identifier les dégradations.
 *
 * Paramètres : ?days=7 (taille de chaque période)
 *
 * POST /api/admin/monitoring/drift (cron)
 * Déclenche une vérification de drift et alerte par email si dégradation.
 *
 * @module app/api/admin/monitoring/drift/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { generateDriftReport, checkDrift } from '@/lib/ai/drift-detection-service'
import { verifyCronSecret } from '@/lib/auth/verify-cron-secret'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id || (session.user.role !== 'admin' && session.user.role !== 'super_admin')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)

    const report = await generateDriftReport(days)

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (error) {
    console.error('[Drift Detection] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth par CRON_SECRET (header X-Cron-Secret ou Authorization: Bearer)
    const xCronSecret = request.headers.get('x-cron-secret')
    const authHeader = request.headers.get('authorization')
    const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    const providedSecret = xCronSecret || bearerSecret
    if (!providedSecret || !verifyCronSecret(providedSecret)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    const days = parseInt(((body as Record<string, unknown>)?.days as string) || '7', 10)
    const result = await checkDrift(days)

    return NextResponse.json({
      success: true,
      status: result.status,
      alertCount: result.alerts.length,
      alerts: result.alerts,
    })
  } catch (error) {
    console.error('[Drift Detection Cron] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
