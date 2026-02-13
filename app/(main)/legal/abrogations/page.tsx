import { Suspense } from 'react'
import { Metadata } from 'next'
import { AbrogationsList } from '@/components/legal/abrogations/abrogations-list'
import { StatsWidget } from '@/components/legal/abrogations/stats-widget'
import type { AbrogationStats } from '@/types/legal-abrogations'

export const metadata: Metadata = {
  title: 'Abrogations Juridiques Tunisiennes | Qadhya',
  description:
    'Consultez la base de données complète des abrogations juridiques en Tunisie. Recherchez par domaine, date et référence.',
}

async function getStats(): Promise<AbrogationStats> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/legal/abrogations/stats`, {
    next: { revalidate: 3600 }, // Cache 1 heure
  })

  if (!res.ok) {
    throw new Error('Failed to fetch stats')
  }

  return res.json()
}

export default async function AbrogationsPage({
  searchParams,
}: {
  searchParams: { domain?: string; page?: string; search?: string }
}) {
  const stats = await getStats()

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Abrogations Juridiques</h1>
        <p className="text-muted-foreground">
          Base de données complète des lois abrogées en Tunisie avec fonction de recherche
          avancée
        </p>
      </div>

      {/* Statistiques */}
      <Suspense fallback={<StatsWidgetSkeleton />}>
        <StatsWidget stats={stats} />
      </Suspense>

      {/* Liste des abrogations */}
      <Suspense fallback={<AbrogationsListSkeleton />}>
        <AbrogationsList
          initialDomain={searchParams.domain}
          initialPage={parseInt(searchParams.page || '1')}
          initialSearch={searchParams.search}
        />
      </Suspense>
    </div>
  )
}

function StatsWidgetSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  )
}

function AbrogationsListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-12 bg-muted animate-pulse rounded-lg" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
      ))}
    </div>
  )
}
