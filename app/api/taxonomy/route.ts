/**
 * API Endpoint: Taxonomie juridique
 *
 * GET /api/taxonomy?type=tribunal|chambre|domain|document_type
 *
 * Retourne les options de taxonomie pour les filtres juridiques
 * Cache: 1 heure (données statiques)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')

    if (!type) {
      return NextResponse.json(
        { error: 'Paramètre "type" requis' },
        { status: 400 }
      )
    }

    // Valider le type
    const validTypes = ['tribunal', 'chambre', 'domain', 'document_type', 'category']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type invalide. Types valides: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Récupérer les options depuis la table legal_taxonomy
    const query = `
      SELECT
        code,
        label_fr,
        label_ar,
        description_fr,
        description_ar
      FROM legal_taxonomy
      WHERE type = $1 AND active = true
      ORDER BY sort_order ASC, label_fr ASC
    `

    const result = await db.query(query, [type])

    const items = result.rows.map((row) => ({
      code: row.code,
      labelFr: row.label_fr,
      labelAr: row.label_ar,
      descriptionFr: row.description_fr,
      descriptionAr: row.description_ar,
    }))

    return NextResponse.json({
      type,
      items,
      count: items.length,
    }, {
      headers: getCacheHeaders(CACHE_PRESETS.LONG) // Cache 1 heure
    })
  } catch (error) {
    console.error('[API Taxonomy] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
