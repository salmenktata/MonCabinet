/**
 * Page Super Admin - Sources Web
 * Liste et gestion des sources web pour le crawling
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { getWebSourcesListData } from '@/lib/web-scraper/source-service'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { WebSourcesStats } from '@/components/super-admin/web-sources/WebSourcesStats'
import { WebSourcesFilters } from '@/components/super-admin/web-sources/WebSourcesFilters'
import { WebSourcesTable } from '@/components/super-admin/web-sources/WebSourcesTable'
import { WebSourcesCards } from '@/components/super-admin/web-sources/WebSourcesCards'
import { WebSourcePipelineView } from '@/components/super-admin/web-sources/WebSourcePipelineView'
import type { ViewMode, SortField, SortDirection } from '@/components/super-admin/web-sources/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    category?: string
    status?: string
    search?: string
    language?: string
    sortBy?: string
    sortDir?: string
    view?: string
    page?: string
  }>
}

export default async function WebSourcesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page = parseInt(params.page || '1', 10)
  const viewMode: ViewMode = (params.view as ViewMode) || 'table'
  const sortBy = (params.sortBy as SortField) || 'priority'
  const sortDir = (params.sortDir as SortDirection) || 'desc'

  // Auth
  const session = await getSession()
  let userRole = 'user'
  if (session?.user?.id) {
    const userResult = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
    userRole = userResult.rows[0]?.role || 'user'
  }
  const isSuperAdmin = userRole === 'super_admin'

  // Data
  const effectiveStatus = params.status ?? 'active'

  const data = await getWebSourcesListData({
    category: params.category,
    status: effectiveStatus,
    search: params.search,
    language: params.language,
    sortBy,
    sortDir,
    page,
  })

  const sharedListProps = {
    sources: data.sources,
    currentPage: page,
    totalPages: data.totalPages,
    totalCount: data.total,
    category: params.category || '',
    status: effectiveStatus,
    search: params.search || '',
    language: params.language || '',
    sortBy: params.sortBy || '',
    sortDir: params.sortDir || '',
    view: params.view || '',
    readOnly: !isSuperAdmin,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sources Web</h1>
          <p className="text-slate-400 mt-1">
            {isSuperAdmin
              ? 'Gerez les sources web pour l\'ingestion automatique dans le RAG'
              : 'Consultez les sources web utilisees pour le RAG'
            }
          </p>
        </div>
        {isSuperAdmin && (
          <Link href="/super-admin/web-sources/new">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Icons.plus className="h-4 w-4 mr-2" />
              Ajouter une source
            </Button>
          </Link>
        )}
      </div>

      {/* Stats */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <WebSourcesStats stats={data.stats} />
      </Suspense>

      {/* Filters */}
      <WebSourcesFilters
        category={params.category || ''}
        status={effectiveStatus}
        search={params.search || ''}
        language={params.language || ''}
        sortBy={sortBy}
        sortDir={sortDir}
        view={viewMode}
      />

      {/* Content - Table (default), Cards or Pipeline */}
      {viewMode === 'pipeline' ? (
        <WebSourcePipelineView
          category={params.category}
          search={params.search}
          isActive={effectiveStatus === 'active' ? true : effectiveStatus === 'inactive' ? false : undefined}
        />
      ) : (
        <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
          {viewMode === 'cards' ? (
            <WebSourcesCards {...sharedListProps} />
          ) : (
            <WebSourcesTable {...sharedListProps} />
          )}
        </Suspense>
      )}
    </div>
  )
}
