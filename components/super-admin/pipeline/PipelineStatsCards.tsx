'use client'

interface FunnelStats {
  total: number
  pendingValidation: number
  rejected: number
  needsRevision: number
  stages: Array<{ stage: string; count: number }>
}

interface PipelineStatsCardsProps {
  funnel: FunnelStats
}

export function PipelineStatsCards({ funnel }: PipelineStatsCardsProps) {
  const ragActive = funnel.stages.find(s => s.stage === 'rag_active')?.count ?? 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground mb-1">Total Documents</p>
        <p className="text-3xl font-bold">{funnel.total.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground mb-1">RAG Actif</p>
        <p className="text-3xl font-bold text-green-600">{ragActive.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground mb-1">En Validation</p>
        <p className="text-3xl font-bold text-amber-600">{funnel.pendingValidation.toLocaleString()}</p>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <p className="text-sm text-muted-foreground mb-1">À réviser / Rejetés</p>
        <p className="text-3xl font-bold text-red-600">
          {(funnel.needsRevision + funnel.rejected).toLocaleString()}
        </p>
      </div>
    </div>
  )
}

export function PipelineStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-6 animate-pulse">
          <div className="h-3 w-24 bg-muted rounded mb-3" />
          <div className="h-8 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}
