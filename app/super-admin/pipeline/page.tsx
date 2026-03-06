import { Suspense } from 'react'
import { PipelineDashboard } from '@/components/super-admin/pipeline/PipelineDashboard'

function PipelinePageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 bg-card rounded" />
          <div className="h-4 w-64 bg-card rounded" />
        </div>
        <div className="h-8 w-28 bg-card rounded" />
      </div>
      {/* Stats cards skeleton — 5 colonnes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-muted/20 p-5 h-28" />
        ))}
      </div>
      {/* Funnel skeleton */}
      <div className="rounded-lg border bg-card p-6 space-y-3">
        <div className="h-4 w-32 bg-muted rounded" />
        <div className="h-8 w-full bg-muted rounded" />
        <div className="h-8 w-4/5 bg-muted rounded" />
        <div className="h-8 w-3/5 bg-muted rounded" />
      </div>
    </div>
  )
}

export default function PipelinePage() {
  return (
    <Suspense fallback={<PipelinePageSkeleton />}>
      <PipelineDashboard />
    </Suspense>
  )
}
