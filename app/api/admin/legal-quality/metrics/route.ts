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
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { compareWithBaseline } from '@/lib/metrics/legal-quality-metrics'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const { db } = await import('@/lib/db/postgres')
    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )
    const userRole = userResult.rows[0]?.role
    if (userRole !== 'admin' && userRole !== 'super-admin') {
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
