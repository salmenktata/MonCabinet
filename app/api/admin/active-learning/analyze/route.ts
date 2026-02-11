/**
 * API Route - Analyse Active Learning (Phase 5.2)
 *
 * GET /api/admin/active-learning/analyze?daysBack=30&minOccurrences=3&maxRating=3&domains=droit_civil
 *
 * Retourne analyse complète gaps KB avec recommendations.
 *
 * @module app/api/admin/active-learning/analyze/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/auth-options'
import { findKnowledgeGaps } from '@/lib/ai/active-learning-service'

// =============================================================================
// GET - Analyser Gaps KB
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Authentification admin
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    // Vérifier rôle admin/super-admin
    const { db } = await import('@/lib/db/postgres')
    const userResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [session.user.id]
    )
    const userRole = userResult.rows[0]?.role
    if (userRole !== 'admin' && userRole !== 'super-admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Paramètres query
    const searchParams = request.nextUrl.searchParams
    const daysBack = parseInt(searchParams.get('daysBack') || '30', 10)
    const minOccurrences = parseInt(
      searchParams.get('minOccurrences') || '3',
      10
    )
    const maxRating = parseInt(searchParams.get('maxRating') || '3', 10)
    const domainsParam = searchParams.get('domains')
    const domains = domainsParam ? domainsParam.split(',') : []

    // Validation paramètres
    if (
      daysBack < 1 ||
      daysBack > 365 ||
      minOccurrences < 1 ||
      maxRating < 1 ||
      maxRating > 5
    ) {
      return NextResponse.json(
        { error: 'Paramètres invalides' },
        { status: 400 }
      )
    }

    // Appeler service Active Learning
    const startTime = Date.now()
    const result = await findKnowledgeGaps({
      daysBack,
      minOccurrences,
      maxRating,
      domains,
      limit: 50,
    })
    const duration = Date.now() - startTime

    console.log(
      `[Active Learning API] Analyse complétée en ${duration}ms - ${result.gaps.length} gaps trouvés`
    )

    return NextResponse.json({
      success: true,
      gaps: result.gaps,
      stats: result.stats,
      recommendations: result.recommendations,
      analysisTime: duration,
    })
  } catch (error) {
    console.error('[Active Learning API] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
