'use client'

import { useTranslations } from 'next-intl'
import { SlidersHorizontal, RotateCcw, ArrowUpDown } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

type DossierType =
  | 'civil_premiere_instance'
  | 'divorce'
  | 'commercial'
  | 'refere'
  | 'penal'
  | 'administratif'
  | 'faillite'
  | 'execution_forcee'
  | 'cassation'
  | 'social'
  | 'autre'

type Priority = 'low' | 'medium' | 'high' | 'urgent'
type SortBy = 'createdAt' | 'updatedAt' | 'dateOuverture' | 'priority'
type SortOrder = 'asc' | 'desc'

export interface FilterState {
  typeFilter: DossierType | undefined
  priorityFilter: Priority | undefined
  sortBy: SortBy
  sortOrder: SortOrder
}

interface DossiersFiltersProps extends FilterState {
  activeCount: number
  onChange: (filters: Partial<FilterState>) => void
  onReset: () => void
}

export default function DossiersFilters({
  typeFilter,
  priorityFilter,
  sortBy,
  sortOrder,
  activeCount,
  onChange,
  onReset,
}: DossiersFiltersProps) {
  const t = useTranslations('dossiers')

  const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: 'createdAt', label: t('sortByCreatedAt') },
    { value: 'updatedAt', label: t('sortByUpdatedAt') },
    { value: 'dateOuverture', label: t('sortByDateOuverture') },
    { value: 'priority', label: t('sortByPriority') },
  ]

  const TYPE_OPTIONS: { value: DossierType; labelKey: string }[] = [
    { value: 'civil_premiere_instance', labelKey: 'types.civil_premiere_instance' },
    { value: 'divorce', labelKey: 'types.divorce' },
    { value: 'commercial', labelKey: 'types.commercial' },
    { value: 'refere', labelKey: 'types.refere' },
    { value: 'penal', labelKey: 'types.penal' },
    { value: 'administratif', labelKey: 'types.administratif' },
    { value: 'faillite', labelKey: 'types.faillite' },
    { value: 'execution_forcee', labelKey: 'types.execution_forcee' },
    { value: 'cassation', labelKey: 'types.cassation' },
    { value: 'social', labelKey: 'types.social' },
    { value: 'autre', labelKey: 'types.autre' },
  ]

  const PRIORITY_OPTIONS: { value: Priority; labelKey: string }[] = [
    { value: 'low', labelKey: 'priorityLabels.low' },
    { value: 'medium', labelKey: 'priorityLabels.medium' },
    { value: 'high', labelKey: 'priorityLabels.high' },
    { value: 'urgent', labelKey: 'priorityLabels.urgent' },
  ]

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Type de procédure */}
      <Select
        value={typeFilter ?? '__all__'}
        onValueChange={(v) =>
          onChange({ typeFilter: v === '__all__' ? undefined : (v as DossierType) })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs border-dashed gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <SelectValue placeholder={t('filterType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{t('allTypes')}</SelectItem>
          {TYPE_OPTIONS.map(({ value, labelKey }) => (
            <SelectItem key={value} value={value}>
              {t(labelKey as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priorité */}
      <Select
        value={priorityFilter ?? '__all__'}
        onValueChange={(v) =>
          onChange({ priorityFilter: v === '__all__' ? undefined : (v as Priority) })
        }
      >
        <SelectTrigger className="h-8 w-auto min-w-[130px] text-xs border-dashed gap-1.5">
          <SelectValue placeholder={t('filterPriority')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{t('allPriorities')}</SelectItem>
          {PRIORITY_OPTIONS.map(({ value, labelKey }) => (
            <SelectItem key={value} value={value}>
              {t(labelKey as Parameters<typeof t>[0])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Tri */}
      <div className="flex items-center gap-1">
        <Select
          value={sortBy}
          onValueChange={(v) => onChange({ sortBy: v as SortBy })}
        >
          <SelectTrigger className="h-8 w-auto min-w-[160px] text-xs gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => onChange({ sortOrder: sortOrder === 'asc' ? 'desc' : 'asc' })}
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title={sortOrder === 'asc' ? t('sortDesc') : t('sortAsc')}
        >
          {sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      {/* Reset */}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={onReset}
        >
          <RotateCcw className="h-3 w-3" />
          {t('filtersReset')}
          <span className="ml-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 text-[10px] font-bold">
            {activeCount}
          </span>
        </Button>
      )}
    </div>
  )
}
