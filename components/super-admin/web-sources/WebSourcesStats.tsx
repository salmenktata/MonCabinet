'use client'

import { Icons } from '@/lib/icons'

interface WebSourcesStatsProps {
  stats: {
    totalSources: number
    activeSources: number
    healthySources: number
    failingSources: number
    totalPages: number
    indexedPages: number
    pendingJobs: number
    runningJobs: number
    schedulerEnabled?: boolean
    nextScheduledCrawl?: string | null
  }
}

export function WebSourcesStats({ stats }: WebSourcesStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatCard
        icon={<Icons.globe className="h-5 w-5" />}
        label="Sources actives"
        value={stats.activeSources}
        subValue={`/ ${stats.totalSources} total`}
        color="blue"
      />
      <StatCard
        icon={<Icons.checkCircle className="h-5 w-5" />}
        label="En bonne santé"
        value={stats.healthySources}
        subValue={stats.failingSources > 0 ? `${stats.failingSources} en erreur` : 'Aucune erreur'}
        color={stats.failingSources > 0 ? 'yellow' : 'green'}
      />
      <StatCard
        icon={<Icons.fileText className="h-5 w-5" />}
        label="Pages indexées"
        value={stats.indexedPages}
        subValue={`/ ${stats.totalPages} crawlées`}
        color="purple"
      />
      <StatCard
        icon={<Icons.loader className="h-5 w-5" />}
        label="Jobs en cours"
        value={stats.runningJobs}
        subValue={`${stats.pendingJobs} en attente`}
        color={stats.runningJobs > 0 ? 'orange' : 'slate'}
      />
      <StatCard
        icon={<Icons.clock className="h-5 w-5" />}
        label="Scheduler"
        value={stats.schedulerEnabled ? 1 : 0}
        subValue={stats.schedulerEnabled ? 'Actif' : 'Inactif'}
        color={stats.schedulerEnabled ? 'green' : 'slate'}
      />
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  subValue: string
  color: 'blue' | 'green' | 'yellow' | 'orange' | 'purple' | 'slate'
}

function StatCard({ icon, label, value, subValue, color }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    green: 'bg-green-500/10 text-green-400 border-green-500/30',
    yellow: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    orange: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    slate: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  }

  return (
    <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{subValue}</div>
    </div>
  )
}
