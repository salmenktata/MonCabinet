/**
 * API Admin - Enrichissement batch métadonnées abrogation
 *
 * POST /api/admin/kb/enrich-abrogations
 *
 * Lance le processus batch de détection d'abrogations
 * pour enrichir la base de connaissances.
 *
 * @module app/api/admin/kb/enrich-abrogations/route
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { batchDetectAbrogations } from '@/lib/knowledge-base/abrogation-detector'

/**
 * POST - Lance enrichissement batch abrogations
 *
 * Query params :
 * - limit : Nombre de documents à traiter (défaut: 100)
 * - offset : Offset pagination (défaut: 0)
 * - category : Catégorie à traiter (optionnel)
 *
 * Protégé : admin/super_admin uniquement
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentification : Session admin OU CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const cronSecret = authHeader?.replace('Bearer ', '')

    // Vérifier CRON_SECRET d'abord (pour cron jobs)
    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      console.log('[Enrich Abrogations] Authentification via CRON_SECRET')
    } else {
      // Sinon vérifier session utilisateur
      const session = await getSession()
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
      }

      const userRole = session.user.role
      if (userRole !== 'admin' && userRole !== 'super_admin') {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
      }
    }

    // 2. Paramètres
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '100', 10)
    const offset = parseInt(searchParams.get('offset') || '0', 10)
    const category = searchParams.get('category') || undefined

    console.log(`[Enrich Abrogations] Démarrage batch: limit=${limit}, offset=${offset}, category=${category}`)

    // 3. Lancer batch
    const startTime = Date.now()
    const stats = await batchDetectAbrogations({
      limit,
      offset,
      category,
    })

    const duration = Date.now() - startTime

    console.log(`[Enrich Abrogations] Terminé en ${duration}ms:`, stats)

    // 4. Retourner résultats
    return NextResponse.json({
      success: true,
      stats,
      duration,
      nextOffset: offset + limit,
    })
  } catch (error) {
    console.error('[Enrich Abrogations API] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

/**
 * GET - Retourne statistiques enrichissement
 *
 * Compte combien de documents ont métadonnées abrogation
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentification admin
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const userRole = session.user.role
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // 2. Requête statistiques
    const { query } = await import('@/lib/db/postgres')

    const result = await query(`
      SELECT
        COUNT(*) as total_documents,
        COUNT(CASE WHEN metadata->'abrogation' IS NOT NULL THEN 1 END) as enriched_documents,
        COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'abrogated' THEN 1 END) as abrogated_count,
        COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'modified' THEN 1 END) as modified_count,
        COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'suspended' THEN 1 END) as suspended_count,
        COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'active' THEN 1 END) as active_count
      FROM knowledge_base
      WHERE is_indexed = true
    `)

    const stats = result.rows[0]

    return NextResponse.json({
      stats: {
        totalDocuments: parseInt(stats.total_documents, 10),
        enrichedDocuments: parseInt(stats.enriched_documents, 10),
        abrogatedCount: parseInt(stats.abrogated_count, 10),
        modifiedCount: parseInt(stats.modified_count, 10),
        suspendedCount: parseInt(stats.suspended_count, 10),
        activeCount: parseInt(stats.active_count, 10),
      },
    })
  } catch (error) {
    console.error('[Enrich Abrogations Stats] Erreur:', error)
    return NextResponse.json(
      {
        error: 'Erreur serveur',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
