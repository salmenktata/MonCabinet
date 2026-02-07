/**
 * Page Super Admin - Sources Web
 * Liste et gestion des sources web pour le crawling
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { WebSourcesList } from '@/components/super-admin/web-sources/WebSourcesList'
import { WebSourcesFilters } from '@/components/super-admin/web-sources/WebSourcesFilters'
import { WebSourcesStats } from '@/components/super-admin/web-sources/WebSourcesStats'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    category?: string
    status?: string
    search?: string
    page?: string
  }>
}

async function getWebSourcesData(params: {
  category?: string
  status?: string
  search?: string
  page: number
}) {
  const limit = 20
  const offset = (params.page - 1) * limit

  let whereClause = 'WHERE 1=1'
  const queryParams: (string | boolean)[] = []
  let paramIndex = 1

  if (params.category) {
    whereClause += ` AND category = $${paramIndex++}`
    queryParams.push(params.category)
  }

  if (params.status === 'active') {
    whereClause += ` AND is_active = true`
  } else if (params.status === 'inactive') {
    whereClause += ` AND is_active = false`
  } else if (params.status === 'failing') {
    whereClause += ` AND health_status IN ('failing', 'degraded')`
  }

  if (params.search) {
    whereClause += ` AND (name ILIKE $${paramIndex} OR base_url ILIKE $${paramIndex})`
    queryParams.push(`%${params.search}%`)
    paramIndex++
  }

  // Compter le total
  const countResult = await db.query(
    `SELECT COUNT(*) FROM web_sources ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0].count)

  // Récupérer les sources avec stats (seulement les champs nécessaires)
  const sourcesResult = await db.query(
    `SELECT
      ws.id,
      ws.name,
      ws.base_url,
      ws.description,
      ws.category,
      ws.language,
      ws.priority,
      ws.is_active,
      ws.health_status,
      ws.consecutive_failures,
      ws.last_crawl_at,
      ws.next_crawl_at,
      ws.total_pages_discovered,
      ws.avg_pages_per_crawl,
      (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id) as pages_count,
      (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id AND is_indexed = true) as indexed_count
    FROM web_sources ws
    ${whereClause}
    ORDER BY ws.priority DESC, ws.name ASC
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...queryParams, limit, offset]
  )

  // Statistiques globales
  const statsResult = await db.query('SELECT * FROM get_web_sources_stats()')
  const stats = statsResult.rows[0]

  // Sérialiser les dates PostgreSQL pour les passer aux composants client
  const serializedSources = sourcesResult.rows.map(source => ({
    ...source,
    last_crawl_at: source.last_crawl_at?.toISOString() || null,
    next_crawl_at: source.next_crawl_at?.toISOString() || null,
  }))

  return {
    sources: serializedSources,
    total,
    totalPages: Math.ceil(total / limit),
    stats: {
      totalSources: parseInt(stats.total_sources) || 0,
      activeSources: parseInt(stats.active_sources) || 0,
      healthySources: parseInt(stats.healthy_sources) || 0,
      failingSources: parseInt(stats.failing_sources) || 0,
      totalPages: parseInt(stats.total_pages) || 0,
      indexedPages: parseInt(stats.indexed_pages) || 0,
      pendingJobs: parseInt(stats.pending_jobs) || 0,
      runningJobs: parseInt(stats.running_jobs) || 0,
    },
  }
}

export default async function WebSourcesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1')

  const data = await getWebSourcesData({
    category: params.category,
    status: params.status,
    search: params.search,
    page,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sources Web</h1>
          <p className="text-slate-400 mt-1">
            Gérez les sources web pour l'ingestion automatique dans le RAG
          </p>
        </div>
        <Link href="/super-admin/web-sources/new">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Icons.plus className="h-4 w-4 mr-2" />
            Ajouter une source
          </Button>
        </Link>
      </div>

      {/* Statistiques */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <WebSourcesStats stats={data.stats} />
      </Suspense>

      {/* Filtres */}
      <WebSourcesFilters
        category={params.category || ''}
        status={params.status || ''}
        search={params.search || ''}
      />

      {/* Liste des sources */}
      <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
        <WebSourcesList
          sources={data.sources}
          currentPage={page}
          totalPages={data.totalPages}
          category={params.category || ''}
          status={params.status || ''}
          search={params.search || ''}
        />
      </Suspense>
    </div>
  )
}
