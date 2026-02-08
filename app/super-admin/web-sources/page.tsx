/**
 * Page Super Admin - Sources Web
 * Liste et gestion des sources web pour le crawling
 */

import { Suspense } from 'react'
import Link from 'next/link'
import nextDynamic from 'next/dynamic'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

// Dynamic imports pour réduire le bundle initial
const WebSourcesList = nextDynamic(
  () => import('@/components/super-admin/web-sources/WebSourcesList').then(m => ({ default: m.WebSourcesList })),
  { loading: () => <div className="h-96 bg-slate-800 animate-pulse rounded-lg" /> }
)

const WebSourcesFilters = nextDynamic(
  () => import('@/components/super-admin/web-sources/WebSourcesFilters').then(m => ({ default: m.WebSourcesFilters })),
  { loading: () => <div className="h-16 bg-slate-800 animate-pulse rounded-lg" /> }
)

const WebSourcesStats = nextDynamic(
  () => import('@/components/super-admin/web-sources/WebSourcesStats').then(m => ({ default: m.WebSourcesStats })),
  { loading: () => <div className="h-32 bg-slate-800 animate-pulse rounded-lg" /> }
)

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

  // Statistiques globales - avec fallback si la fonction n'existe pas
  let stats = {
    total_sources: 0,
    active_sources: 0,
    healthy_sources: 0,
    failing_sources: 0,
    total_pages: 0,
    indexed_pages: 0,
    pending_jobs: 0,
    running_jobs: 0,
  }

  try {
    const statsResult = await db.query('SELECT * FROM get_web_sources_stats()')
    if (statsResult.rows[0]) {
      stats = statsResult.rows[0]
    }
  } catch (error) {
    // Fallback: calculer les stats manuellement si la fonction n'existe pas
    console.warn('get_web_sources_stats() non disponible, calcul manuel des stats')
    try {
      const [sourcesStats, pagesStats, jobsStats] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*) as total_sources,
            COUNT(*) FILTER (WHERE is_active = true) as active_sources,
            COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_sources,
            COUNT(*) FILTER (WHERE health_status = 'failing') as failing_sources
          FROM web_sources
        `),
        db.query(`
          SELECT
            COUNT(*) as total_pages,
            COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages
          FROM web_pages
        `),
        db.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
            COUNT(*) FILTER (WHERE status = 'running') as running_jobs
          FROM web_crawl_jobs
        `),
      ])
      stats = {
        ...sourcesStats.rows[0],
        ...pagesStats.rows[0],
        ...jobsStats.rows[0],
      }
    } catch {
      // Garder les valeurs par défaut
    }
  }

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
      totalSources: Number(stats.total_sources) || 0,
      activeSources: Number(stats.active_sources) || 0,
      healthySources: Number(stats.healthy_sources) || 0,
      failingSources: Number(stats.failing_sources) || 0,
      totalPages: Number(stats.total_pages) || 0,
      indexedPages: Number(stats.indexed_pages) || 0,
      pendingJobs: Number(stats.pending_jobs) || 0,
      runningJobs: Number(stats.running_jobs) || 0,
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
