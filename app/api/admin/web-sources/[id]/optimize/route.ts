/**
 * API endpoint pour optimiser automatiquement une source web
 * POST /api/admin/web-sources/:id/optimize
 */

import { NextRequest, NextResponse } from 'next/server'
import { optimizeWebSource, detectSiteType } from '@/lib/web-scraper/crawler-optimizer-service'
import { getSession } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // 60 secondes max

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier l'authentification
    const session = await getSession()
    if (!session?.userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const sourceId = params.id

    // 1. Détecter le type de site
    console.log(`[API] Detecting site type for source ${sourceId}`)
    const { rows } = await import('@/lib/db/postgres').then(m => m.db.query(
      `SELECT base_url FROM web_sources WHERE id = $1`,
      [sourceId]
    ))

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Source non trouvée' }, { status: 404 })
    }

    const baseUrl = (rows[0] as any).base_url
    const detection = await detectSiteType(baseUrl)

    // 2. Appliquer l'optimisation
    console.log(`[API] Optimizing source ${sourceId} (detected: ${detection.type})`)
    const result = await optimizeWebSource(sourceId)

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Échec de l\'optimisation',
          warnings: result.warnings,
        },
        { status: 500 }
      )
    }

    // 3. Retourner les résultats
    return NextResponse.json({
      success: true,
      detection: {
        type: detection.type,
        confidence: detection.confidence,
        evidence: detection.evidence,
      },
      optimization: {
        appliedProfile: result.appliedProfile,
        changesCount: Object.keys(result.changes).length,
        changes: result.changes,
        warnings: result.warnings,
        recommendations: result.recommendations,
      },
    })
  } catch (error) {
    console.error('[API] Error optimizing source:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
