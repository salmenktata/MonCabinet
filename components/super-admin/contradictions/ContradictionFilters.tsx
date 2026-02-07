'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface ContradictionFiltersProps {
  currentStatus?: string
  currentSeverity?: string
}

export function ContradictionFilters({
  currentStatus,
  currentSeverity,
}: ContradictionFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('status', value)
    } else {
      params.delete('status')
    }
    params.delete('page')
    router.push(`?${params.toString()}`)
  }

  const handleSeverityChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set('severity', value)
    } else {
      params.delete('severity')
    }
    params.delete('page')
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Statut:</span>
        <select
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1 text-sm text-white"
          value={currentStatus || ''}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="">Tous</option>
          <option value="pending">En attente</option>
          <option value="under_review">En cours</option>
          <option value="resolved">Resolues</option>
          <option value="dismissed">Rejetees</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Severite:</span>
        <select
          className="bg-slate-800 border border-slate-600 rounded px-3 py-1 text-sm text-white"
          value={currentSeverity || ''}
          onChange={(e) => handleSeverityChange(e.target.value)}
        >
          <option value="">Toutes</option>
          <option value="critical">Critique</option>
          <option value="high">Haute</option>
          <option value="medium">Moyenne</option>
          <option value="low">Faible</option>
        </select>
      </div>
    </div>
  )
}
