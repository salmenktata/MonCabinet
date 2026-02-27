'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import CalendarWidget, { type CalendarEcheance } from '@/components/dashboard/CalendarWidget'
import { Icons } from '@/lib/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

type TypeFilter = 'all' | 'audience' | 'delai_legal' | 'delai_interne' | 'autre'

interface AgendaClientProps {
  echeances: CalendarEcheance[]
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats(echeances: CalendarEcheance[]) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const total = echeances.length
  const depasses = echeances.filter(e => new Date(e.date_echeance) < today).length
  const audiences = echeances.filter(e => e.type_echeance === 'audience').length
  const legaux = echeances.filter(e => e.type_echeance === 'delai_legal').length
  const semaine = echeances.filter(e => {
    const d = new Date(e.date_echeance)
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    return diff >= 0 && diff <= 7
  }).length

  return { total, depasses, audiences, legaux, semaine }
}

// ─── Filter chip ─────────────────────────────────────────────────────────────

const TYPE_FILTERS: { value: TypeFilter; label: string; icon: keyof typeof Icons; color: string }[] = [
  { value: 'all',           label: 'Toutes',          icon: 'calendar',     color: 'text-muted-foreground' },
  { value: 'audience',      label: 'Audiences',       icon: 'gavel',        color: 'text-violet-400' },
  { value: 'delai_legal',   label: 'Délais légaux',   icon: 'scale',        color: 'text-orange-400' },
  { value: 'delai_interne', label: 'Délais internes', icon: 'clock',        color: 'text-blue-400' },
  { value: 'autre',         label: 'Autres',          icon: 'bookmark',     color: 'text-muted-foreground' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function AgendaClient({ echeances }: AgendaClientProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  const filtered = typeFilter === 'all'
    ? echeances
    : echeances.filter(e => e.type_echeance === typeFilter)

  const stats = getStats(echeances)

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total actives" value={stats.total} color="text-foreground" />
        <StatCard label="Cette semaine" value={stats.semaine} color="text-blue-400" />
        <StatCard label="Audiences" value={stats.audiences} color="text-violet-400" />
        <StatCard label="Délais légaux" value={stats.legaux} color="text-orange-400" />
        <StatCard label="En retard" value={stats.depasses} color={stats.depasses > 0 ? 'text-red-400' : 'text-muted-foreground'} />
      </div>

      {/* Filtres type */}
      <div className="flex flex-wrap gap-2">
        {TYPE_FILTERS.map(f => {
          const Icon = Icons[f.icon] ?? Icons.calendar
          const count = f.value === 'all'
            ? echeances.length
            : echeances.filter(e => e.type_echeance === f.value).length
          if (f.value !== 'all' && count === 0) return null
          return (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                typeFilter === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50'
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', typeFilter !== f.value && f.color)} />
              {f.label}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                typeFilter === f.value ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* Calendrier plein écran */}
      <CalendarWidget echeances={filtered} />
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className={cn('text-2xl font-bold', color)}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}
