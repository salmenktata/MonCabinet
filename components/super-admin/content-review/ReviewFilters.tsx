'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const REVIEW_TYPE_LABELS: Record<string, string> = {
  classification_uncertain: 'Classification incertaine',
  quality_low: 'Qualité basse',
  contradiction_detected: 'Contradiction',
  content_ambiguous: 'Contenu ambigu',
  source_reliability: 'Fiabilité source',
  legal_update_detected: 'Mise à jour légale',
  duplicate_suspected: 'Doublon potentiel',
  manual_request: 'Demande manuelle',
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'Haute',
  normal: 'Normale',
  low: 'Basse',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  normal: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  assigned: 'Assignée',
  in_progress: 'En cours',
  completed: 'Terminée',
  skipped: 'Passée',
}

interface ReviewFiltersProps {
  currentFilters: {
    status?: string[]
    type?: string[]
    priority?: string[]
  }
}

export function ReviewFilters({ currentFilters }: ReviewFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    params.delete('page') // Reset pagination
    router.push(`?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push('?')
  }

  const hasFilters =
    currentFilters.status?.length ||
    currentFilters.type?.length ||
    currentFilters.priority?.length

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
      {/* Status */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Statut:</span>
        <Select
          value={currentFilters.status?.[0] || 'all'}
          onValueChange={(value) =>
            updateFilter('status', value === 'all' ? null : value)
          }
        >
          <SelectTrigger className="w-36 bg-slate-800 border-slate-600" aria-label="Filtrer par statut">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type de revue */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Type:</span>
        <Select
          value={currentFilters.type?.[0] || 'all'}
          onValueChange={(value) =>
            updateFilter('type', value === 'all' ? null : value)
          }
        >
          <SelectTrigger className="w-48 bg-slate-800 border-slate-600" aria-label="Filtrer par type">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(REVIEW_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Priorité */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400">Priorité:</span>
        <Select
          value={currentFilters.priority?.[0] || 'all'}
          onValueChange={(value) =>
            updateFilter('priority', value === 'all' ? null : value)
          }
        >
          <SelectTrigger className="w-32 bg-slate-800 border-slate-600" aria-label="Filtrer par priorité">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bouton reset */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearFilters}
          className="text-slate-400 hover:text-white"
        >
          <Icons.x className="h-4 w-4 mr-1" />
          Effacer
        </Button>
      )}
    </div>
  )
}

export function ReviewTypeBadge({ type }: { type: string }) {
  const label = REVIEW_TYPE_LABELS[type] || type

  const colors: Record<string, string> = {
    classification_uncertain: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    quality_low: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    contradiction_detected: 'bg-red-500/20 text-red-400 border-red-500/30',
    content_ambiguous: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    source_reliability: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    legal_update_detected: 'bg-green-500/20 text-green-400 border-green-500/30',
    duplicate_suspected: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    manual_request: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }

  return (
    <Badge
      variant="outline"
      className={colors[type] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}
    >
      {label}
    </Badge>
  )
}

export function PriorityBadge({ priority }: { priority: string }) {
  const label = PRIORITY_LABELS[priority] || priority

  return (
    <Badge
      variant="outline"
      className={PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal}
    >
      {label}
    </Badge>
  )
}
