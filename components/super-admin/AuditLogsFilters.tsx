'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface AuditLogsFiltersProps {
  currentAction: string
  currentTarget: string
}

export function AuditLogsFilters({ currentAction, currentTarget }: AuditLogsFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page')
    router.push(`/super-admin/audit-logs?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Filtre Action */}
      <label htmlFor="audit-action-filter" className="sr-only">Filtrer par action</label>
      <select
        id="audit-action-filter"
        className="bg-slate-700 border-slate-600 text-white rounded-md px-3 py-2"
        value={currentAction}
        onChange={(e) => updateFilter('action', e.target.value)}
      >
        <option value="all">Toutes les actions</option>
        <option value="user_approved">Approbation</option>
        <option value="user_rejected">Rejet</option>
        <option value="user_suspended">Suspension</option>
        <option value="user_reactivated">Réactivation</option>
        <option value="user_deleted">Suppression</option>
        <option value="role_changed">Changement rôle</option>
        <option value="plan_changed">Changement plan</option>
        <option value="kb_upload">Upload KB</option>
        <option value="kb_delete">Suppression KB</option>
      </select>

      {/* Filtre Target */}
      <label htmlFor="audit-target-filter" className="sr-only">Filtrer par cible</label>
      <select
        id="audit-target-filter"
        className="bg-slate-700 border-slate-600 text-white rounded-md px-3 py-2"
        value={currentTarget}
        onChange={(e) => updateFilter('target', e.target.value)}
      >
        <option value="all">Toutes les cibles</option>
        <option value="user">Utilisateurs</option>
        <option value="knowledge_base">Base KB</option>
        <option value="config">Configuration</option>
      </select>
    </div>
  )
}
