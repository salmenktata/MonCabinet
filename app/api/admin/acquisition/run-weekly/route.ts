/**
 * API : Acquisition Hebdomadaire Automatique
 *
 * POST /api/admin/acquisition/run-weekly
 * Lance l'acquisition pour toutes les sources web actives configurées pour acquisition auto
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db/postgres'
import { withAdminApiAuth } from '@/lib/auth/with-admin-api-auth'

export const POST = withAdminApiAuth(async (_request: NextRequest, _ctx, _session) => {
  try {
    // 1. Récupérer toutes les sources actives configurées pour acquisition
    const sources = await db.query(
      `
      SELECT id, base_url AS url, name, category
      FROM web_sources
      WHERE is_active = true
      ORDER BY last_crawl_at ASC NULLS FIRST
      `
    )

    if (sources.rows.length === 0) {
      return NextResponse.json({
        success: true,
        sources: 0,
        pages: 0,
        message: 'Aucune source active trouvée',
      })
    }

    let totalPages = 0
    const results = []

    // 2. Lancer l'acquisition pour chaque source
    for (const source of sources.rows) {
      try {
        // Appeler l'API de crawl existante (avec CRON_SECRET pour l'auth interne)
        const crawlResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/admin/web-sources/${source.id}/crawl`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`,
            },
            body: JSON.stringify({
              forceRecrawl: false, // Crawl incrémental
            }),
          }
        )

        if (crawlResponse.ok) {
          const data = await crawlResponse.json()
          totalPages += data.pagesFound || 0

          results.push({
            sourceId: source.id,
            name: source.name,
            status: 'success',
            pages: data.pagesFound || 0,
          })
        } else {
          results.push({
            sourceId: source.id,
            name: source.name,
            status: 'failed',
            error: `HTTP ${crawlResponse.status}`,
          })
        }
      } catch (error) {
        console.error(`Erreur crawl source ${source.id}:`, error)
        results.push({
          sourceId: source.id,
          name: source.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    // 3. Retourner résumé
    return NextResponse.json({
      success: true,
      sources: sources.rows.length,
      pages: totalPages,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Erreur acquisition hebdomadaire:', error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}, { allowCronSecret: true })
