'use client'

import { Database, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import { StatCard } from '@/components/dashboard/StatCard'

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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        title="Total Documents"
        value={funnel.total.toLocaleString('fr-FR')}
        subtitle="Dans le pipeline"
        icon={Database}
        variant="default"
      />
      <StatCard
        title="RAG Actif"
        value={ragActive.toLocaleString('fr-FR')}
        subtitle="Disponibles en recherche"
        icon={CheckCircle2}
        variant="success"
      />
      <StatCard
        title="En Validation"
        value={funnel.pendingValidation.toLocaleString('fr-FR')}
        subtitle="Attendent traitement"
        icon={Clock}
        variant={funnel.pendingValidation > 0 ? 'warning' : 'default'}
      />
      <StatCard
        title="À Réviser"
        value={funnel.needsRevision.toLocaleString('fr-FR')}
        subtitle="Nécessitent correction"
        icon={RotateCcw}
        variant={funnel.needsRevision > 0 ? 'warning' : 'default'}
      />
      <StatCard
        title="Rejetés"
        value={funnel.rejected.toLocaleString('fr-FR')}
        subtitle="Non intégrés"
        icon={XCircle}
        variant={funnel.rejected > 0 ? 'danger' : 'default'}
      />
    </div>
  )
}

export function PipelineStatsCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border/50 bg-muted/20 p-5 animate-pulse">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="h-3 w-24 bg-muted rounded mb-3" />
              <div className="h-9 w-16 bg-muted rounded mb-2" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
            <div className="h-10 w-10 bg-muted rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}
