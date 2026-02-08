'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Icons } from '@/lib/icons'

interface TaxonomyStatsProps {
  stats: {
    total: number
    categories: number
    domains: number
    documentTypes: number
    tribunals: number
    chambers: number
    aiSuggested: number
    systemItems: number
  }
}

export function TaxonomyStats({ stats }: TaxonomyStatsProps) {
  const statItems = [
    {
      label: 'Total',
      value: stats.total,
      icon: 'folder' as const,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      label: 'Catégories',
      value: stats.categories,
      icon: 'tag' as const,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      label: 'Domaines',
      value: stats.domains,
      icon: 'briefcase' as const,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      label: 'Types de documents',
      value: stats.documentTypes,
      icon: 'file' as const,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      label: 'Tribunaux',
      value: stats.tribunals,
      icon: 'building' as const,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      label: 'Suggérés par IA',
      value: stats.aiSuggested,
      icon: 'sparkles' as const,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
