/**
 * Page Super Admin - Revue de Contenu
 * Queue de validation du contenu juridique
 */

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  getReviewQueue,
  getReviewQueueStats,
  getIntelligentPipelineStats,
  getContradictionsStats,
} from '@/app/actions/super-admin/content-review'
import {
  ReviewStats,
  ReviewFilters,
  ReviewQueue,
} from '@/components/super-admin/content-review'
import { getSession } from '@/lib/auth/session'
import type { ReviewStatus, ReviewType, ReviewPriority } from '@/lib/web-scraper/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{
    status?: string
    type?: string
    priority?: string
    page?: string
  }>
}

export default async function ContentReviewPage({ searchParams }: PageProps) {
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const params = await searchParams
  const page = parseInt(params.page || '1')
  const pageSize = 20

  // Préparer les filtres
  const filters: {
    status?: ReviewStatus[]
    reviewTypes?: ReviewType[]
    priority?: ReviewPriority[]
  } = {}

  if (params.status) {
    filters.status = [params.status as ReviewStatus]
  }
  if (params.type) {
    filters.reviewTypes = [params.type as ReviewType]
  }
  if (params.priority) {
    filters.priority = [params.priority as ReviewPriority]
  }

  // Récupérer les données en parallèle
  const [queueData, queueStats, pipelineStats, contradictionsStats] = await Promise.all([
    getReviewQueue({
      ...filters,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    getReviewQueueStats(),
    getIntelligentPipelineStats(),
    getContradictionsStats(),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Revue de Contenu</h1>
        <p className="text-slate-400 mt-1">
          Validez le contenu juridique analysé par le pipeline intelligent
        </p>
      </div>

      {/* Statistiques */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <ReviewStats
          queueStats={queueStats}
          pipelineStats={pipelineStats}
          contradictionsStats={{
            total: contradictionsStats.total,
            pending: contradictionsStats.pending,
            bySeverity: contradictionsStats.bySeverity,
          }}
        />
      </Suspense>

      {/* Filtres */}
      <ReviewFilters
        currentFilters={{
          status: filters.status,
          type: filters.reviewTypes,
          priority: filters.priority,
        }}
      />

      {/* Queue */}
      <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
        <ReviewQueue
          items={queueData.items}
          total={queueData.total}
          currentPage={page}
          pageSize={pageSize}
          userId={session.user.id}
        />
      </Suspense>
    </div>
  )
}
