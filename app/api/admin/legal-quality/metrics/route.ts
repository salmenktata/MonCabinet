/**
 * API Route - Métriques Qualité Juridique (Phase 5.4)
 *
 * GET /api/admin/legal-quality/metrics
 *
 * Retourne métriques qualité avec comparaison baseline.
 *
 * @module app/api/admin/legal-quality/metrics/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { compareWithBaseline } from '@/lib/metrics/legal-quality-metrics'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userRole = session.user.role
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    const comparison = await compareWithBaseline(7)

    return NextResponse.json(comparison)
  } catch (error) {
    console.error('[Legal Quality API] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
