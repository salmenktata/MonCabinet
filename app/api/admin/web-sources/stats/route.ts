/**
 * API Route: Administration - Statistiques des sources web
 *
 * GET /api/admin/web-sources/stats
 * - Retourne les statistiques globales du système de crawl
 * Cache: 1 minute (données changeantes)
 *
 * Réservé aux administrateurs
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db/postgres'
import { getWebSourcesStats } from '@/lib/web-scraper'
import { getCacheHeaders, CACHE_PRESETS } from '@/lib/api/cache-headers'

// =============================================================================
// VÉRIFICATION ADMIN
// =============================================================================

async function checkAdminAccess(userId: string): Promise<boolean> {
  const result = await db.query('SELECT role FROM users WHERE id = $1', [userId])
  const role = result.rows[0]?.role; return role === 'admin' || role === 'super_admin'
}

// =============================================================================
// GET: Statistiques globales
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const isAdmin = await checkAdminAccess(session.user.id)
    if (!isAdmin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }

    const stats = await getWebSourcesStats()

    // Récupérer les derniers crawls
    const recentCrawls = await db.query(
      `SELECT
        wcl.id,
        wcl.web_source_id,
        ws.name as source_name,
        wcl.started_at,
        wcl.completed_at,
        wcl.duration_ms,
        wcl.pages_crawled,
        wcl.pages_new,
        wcl.pages_changed,
        wcl.pages_failed,
        wcl.status
      FROM web_crawl_logs wcl
      JOIN web_sources ws ON wcl.web_source_id = ws.id
      ORDER BY wcl.started_at DESC
      LIMIT 10`
    )

    // Récupérer les sources en échec
    const failingSources = await db.query(
      `SELECT id, name, base_url, health_status, consecutive_failures, last_crawl_at
       FROM web_sources
       WHERE health_status IN ('degraded', 'failing')
       ORDER BY consecutive_failures DESC
       LIMIT 10`
    )

    // Récupérer les prochains crawls prévus
    const upcomingCrawls = await db.query(
      `SELECT id, name, base_url, next_crawl_at, priority
       FROM web_sources
       WHERE is_active = true
       AND next_crawl_at IS NOT NULL
       ORDER BY next_crawl_at ASC
       LIMIT 10`
    )

    return NextResponse.json({
      stats,
      recentCrawls: recentCrawls.rows.map(row => ({
        id: row.id,
        sourceId: row.web_source_id,
        sourceName: row.source_name,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        durationMs: row.duration_ms,
        pagesCrawled: row.pages_crawled,
        pagesNew: row.pages_new,
        pagesChanged: row.pages_changed,
        pagesFailed: row.pages_failed,
        status: row.status,
      })),
      failingSources: failingSources.rows.map(row => ({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        healthStatus: row.health_status,
        consecutiveFailures: row.consecutive_failures,
        lastCrawlAt: row.last_crawl_at,
      })),
      upcomingCrawls: upcomingCrawls.rows.map(row => ({
        id: row.id,
        name: row.name,
        baseUrl: row.base_url,
        nextCrawlAt: row.next_crawl_at,
        priority: row.priority,
      })),
    }, {
      headers: getCacheHeaders(CACHE_PRESETS.SHORT) // Cache 1 minute
    })
  } catch (error) {
    console.error('Erreur récupération stats web sources:', error)
    return NextResponse.json(
      { error: 'Erreur récupération statistiques' },
      { status: 500 }
    )
  }
}
