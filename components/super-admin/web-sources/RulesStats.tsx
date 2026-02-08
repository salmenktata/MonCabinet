'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Icons } from '@/lib/icons'

interface RulesStatsProps {
  stats: {
    total: number
    active: number
    totalMatches: number
    accuracy: number
  }
}

export function RulesStats({ stats }: RulesStatsProps) {
  const statItems = [
    {
      label: 'Règles totales',
      value: stats.total,
      icon: 'filter' as const,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Règles actives',
      value: stats.active,
      icon: 'check' as const,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Matches totaux',
      value: stats.totalMatches,
      icon: 'target' as const,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Précision',
      value: `${(stats.accuracy * 100).toFixed(0)}%`,
      icon: 'chartBar' as const,
      color: stats.accuracy >= 0.7 ? 'text-green-500' : stats.accuracy >= 0.5 ? 'text-yellow-500' : 'text-red-500',
      bgColor: stats.accuracy >= 0.7 ? 'bg-green-500/10' : stats.accuracy >= 0.5 ? 'bg-yellow-500/10' : 'bg-red-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statItems.map((stat) => {
        const Icon = Icons[stat.icon]
        return (
          <Card key={stat.label} className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-slate-400">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
