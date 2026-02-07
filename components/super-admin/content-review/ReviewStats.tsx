'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import type { ReviewQueueStats, IntelligentPipelineStats } from '@/lib/web-scraper/types'

interface ReviewStatsProps {
  queueStats: ReviewQueueStats
  pipelineStats: IntelligentPipelineStats
  contradictionsStats: {
    total: number
    pending: number
    bySeverity: Record<string, number>
  }
}

export function ReviewStats({
  queueStats,
  pipelineStats,
  contradictionsStats,
}: ReviewStatsProps) {
  const stats = [
    {
      title: 'En attente',
      value: queueStats.pendingCount,
      icon: Icons.clock,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
    {
      title: 'Assignées',
      value: queueStats.assignedCount,
      icon: Icons.user,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: "Traitées aujourd'hui",
      value: queueStats.completedToday,
      icon: Icons.check,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Auto-indexées',
      value: pipelineStats.autoIndexed,
      icon: Icons.sparkles,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: 'Auto-rejetées',
      value: pipelineStats.autoRejected,
      icon: Icons.x,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
    },
    {
      title: 'Contradictions',
      value: contradictionsStats.pending,
      icon: Icons.alertTriangle,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      {stats.map((stat) => (
        <Card key={stat.title} className="bg-slate-900/50 border-slate-700">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-slate-400">
              {stat.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ReviewStatsCompact({
  queueStats,
}: {
  queueStats: ReviewQueueStats
}) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-slate-400">{queueStats.pendingCount} en attente</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-blue-500" />
        <span className="text-slate-400">{queueStats.assignedCount} assignées</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-slate-400">{queueStats.completedToday} traitées</span>
      </div>
      {queueStats.avgDecisionTimeMs > 0 && (
        <div className="text-slate-500">
          ~{Math.round(queueStats.avgDecisionTimeMs / 1000)}s / décision
        </div>
      )}
    </div>
  )
}
