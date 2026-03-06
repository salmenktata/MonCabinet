'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PipelineFunnelSectionProps {
  stats: any
}

// Couleur par stage
const STAGE_COLORS: Record<string, string> = {
  source_configured: 'bg-muted-foreground',
  crawled:           'bg-blue-400',
  content_reviewed:  'bg-cyan-400',
  classified:        'bg-violet-400',
  indexed:           'bg-amber-400',
  quality_analyzed:  'bg-orange-400',
  rag_active:        'bg-green-500',
  rejected:          'bg-red-500',
  needs_revision:    'bg-yellow-500',
}

const STAGE_TEXT_COLORS: Record<string, string> = {
  source_configured: 'text-muted-foreground',
  crawled:           'text-blue-400',
  content_reviewed:  'text-cyan-400',
  classified:        'text-violet-400',
  indexed:           'text-amber-400',
  quality_analyzed:  'text-orange-400',
  rag_active:        'text-green-500',
  rejected:          'text-red-500',
  needs_revision:    'text-yellow-500',
}

export default function PipelineFunnelSection({ stats }: PipelineFunnelSectionProps) {
  if (!stats || !stats.funnel) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Vue Funnel - Pipeline</CardTitle>
          <CardDescription>Chargement...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const { stages, total } = stats.funnel
  const maxCount = Math.max(...stages.map((s: any) => s.count), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vue Funnel - Pipeline</CardTitle>
        <CardDescription>
          Distribution des {total?.toLocaleString()} documents par étape
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {stages.map((stage: any) => {
            const barWidth = stage.count === 0 ? 0 : Math.max((stage.count / maxCount) * 100, 0.5)
            const color = STAGE_COLORS[stage.stage] ?? 'bg-muted-foreground'
            const textColor = STAGE_TEXT_COLORS[stage.stage] ?? 'text-muted-foreground'

            return (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground w-44 shrink-0">{stage.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold tabular-nums ${textColor}`}>
                      {stage.count.toLocaleString()}
                    </span>
                    <Badge variant="outline" className="text-xs w-16 justify-center">
                      {stage.percentage}%
                    </Badge>
                  </div>
                </div>
                <div className="h-6 w-full bg-muted rounded-md overflow-hidden">
                  <div
                    className={`h-full rounded-md transition-all duration-500 ${color} ${stage.count === 0 ? 'opacity-20' : 'opacity-90'}`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
