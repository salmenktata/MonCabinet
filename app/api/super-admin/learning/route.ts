/**
 * API pour l'apprentissage automatique
 * Super Admin uniquement
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth/config'
import {
  runLearningCycle,
  getLearningStats,
  getUnusedCorrections,
  analyzeRulesEffectiveness,
} from '@/lib/web-scraper/classification-learning-service'
import { getClassificationStats } from '@/lib/web-scraper/legal-classifier-service'

/**
 * GET /api/super-admin/learning
 * Récupère les statistiques d'apprentissage
 */
export async function GET(request: NextRequest) {
  // Vérifier l'authentification
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action')

    if (action === 'stats') {
      // Statistiques globales
      const [learningStats, classificationStats, rulesEffectiveness] = await Promise.all([
        getLearningStats(),
        getClassificationStats(),
        analyzeRulesEffectiveness(),
      ])

      return NextResponse.json({
        learning: learningStats,
        classification: classificationStats,
        rulesEffectiveness: rulesEffectiveness.slice(0, 10), // Top 10
      })
    }

    if (action === 'corrections') {
      // Corrections non utilisées
      const limit = parseInt(searchParams.get('limit') || '50', 10)
      const corrections = await getUnusedCorrections(undefined, limit)

      return NextResponse.json({
        corrections,
        total: corrections.length,
      })
    }

    if (action === 'rules-effectiveness') {
      // Efficacité des règles
      const effectiveness = await analyzeRulesEffectiveness()

      return NextResponse.json({
        rules: effectiveness,
        summary: {
          total: effectiveness.length,
          toKeep: effectiveness.filter(r => r.recommendation === 'keep').length,
          toReview: effectiveness.filter(r => r.recommendation === 'review').length,
          toDisable: effectiveness.filter(r => r.recommendation === 'disable').length,
        },
      })
    }

    // Stats par défaut
    const stats = await getLearningStats()
    return NextResponse.json(stats)
  } catch (error) {
    console.error('[API Learning] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Inconnue' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/super-admin/learning
 * Déclenche un cycle d'apprentissage manuel
 */
export async function POST(request: NextRequest) {
  // Vérifier l'authentification
  const session = await getServerSession(authOptions)
  if (!session?.user?.isSuperAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const action = body.action

    if (action === 'run-cycle') {
      // Exécuter le cycle d'apprentissage
      console.log('[API Learning] Démarrage cycle d\'apprentissage manuel...')
      const startTime = Date.now()

      const result = await runLearningCycle()

      const duration = Date.now() - startTime

      return NextResponse.json({
        success: true,
        result,
        duration,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error) {
    console.error('[API Learning] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur serveur', details: error instanceof Error ? error.message : 'Inconnue' },
      { status: 500 }
    )
  }
}
