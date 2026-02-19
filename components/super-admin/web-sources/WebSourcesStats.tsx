'use client'

import { Icons } from '@/lib/icons'
import { Progress } from '@/components/ui/progress'
import type { WebSourcesStatsData } from './types'

interface WebSourcesStatsProps {
  stats: WebSourcesStatsData
}

export function WebSourcesStats({ stats }: WebSourcesStatsProps) {
  const indexationPct = stats.totalPages > 0
    ? Math.round((stats.indexedPages / stats.totalPages) * 100)
    : 0

  const indexationColor = indexationPct >= 80 ? 'green' : indexationPct >= 50 ? 'yellow' : 'red'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard
        icon={<Icons.globe className="h-5 w-5" />}
        label="Sources actives"
        value={stats.activeSources}
        subValue={`/ ${stats.totalSources} total`}
        color="blue"
      />

      <StatCard
        icon={stats.failingSources > 0
          ? <Icons.alertTriangle className="h-5 w-5" />
          : <Icons.checkCircle className="h-5 w-5" />
        }
        label="Sante"
        value={stats.failingSources > 0 ? `${stats.failingSources} en erreur` : 'Tout OK'}
        subValue={`${stats.healthySources} saine${stats.healthySources > 1 ? 's' : ''}`}
        color={stats.failingSources > 0 ? 'red' : 'green'}
        valueIsText
      />

      <div className={`p-4 rounded-lg border bg-purple-500/10 text-purple-400 border-purple-500/30`}>
        <div className="flex items-center gap-2 mb-2">
          <Icons.fileText className="h-5 w-5" />
          <span className="text-sm text-slate-300">Couverture indexation</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">{indexationPct}%</span>
          <span className="text-xs text-slate-400">
            {stats.indexedPages.toLocaleString()} / {stats.totalPages.toLocaleString()}
          </span>
        </div>
        <Progress
          value={indexationPct}
          className={`mt-2 h-1.5 ${
            indexationColor === 'green' ? '[&>div]:bg-green-500' :
            indexationColor === 'yellow' ? '[&>div]:bg-yellow-500' :
            '[&>div]:bg-red-500'
          }`}
        />
      </div>

      <StatCard
        icon={<Icons.loader className="h-5 w-5" />}
        label="Jobs en cours"
        value={stats.runningJobs}
        subValue={`${stats.pendingJobs} en attente`}
        color={stats.runningJobs > 0 ? 'orange' : 'slate'}
      />
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  subValue: string
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'slate'
  valueIsText?: boolean
}

function StatCard({ icon, label, value, subValue, color, valueIsText }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    slate: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className={`${valueIsText ? 'text-lg' : 'text-2xl'} font-bold text-white`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{subValue}</div>
    </div>
  )
}
