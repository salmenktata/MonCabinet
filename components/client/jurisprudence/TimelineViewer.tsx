'use client'

/**
 * Composant TimelineViewer - Sprint 4
 *
 * Timeline interactive de l'évolution de la jurisprudence tunisienne avec :
 * - Événements colorés par type (major_shift, confirmation, nuance, standard)
 * - Filtres par domaine/tribunal/date
 * - Zoom et navigation temporelle
 * - Modal détail événement
 */

import { useState } from 'react'
import { Calendar, Filter, TrendingUp, CheckCircle2, AlertTriangle, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EventCard } from './EventCard'

// =============================================================================
// TYPES
// =============================================================================

export type EventType = 'major_shift' | 'confirmation' | 'nuance' | 'standard'

export interface TimelineEvent {
  id: string
  title: string
  decisionNumber: string | null
  decisionDate: Date | null
  tribunalCode: string | null
  tribunalLabel: string | null
  chambreCode: string | null
  chambreLabel: string | null
  domain: string | null
  domainLabel: string | null
  category: string
  eventType: EventType
  eventDescription: string | null
  precedentValue: number
  citedByCount: number
  hasOverrules: boolean
  isOverruled: boolean
  overrulesIds: string[]
  confirmsIds: string[]
  distinguishesIds: string[]
  summary: string | null
  legalBasis: string[] | null
  solution: string | null
}

export interface TimelineStats {
  totalEvents: number
  majorShifts: number
  confirmations: number
  nuances: number
  standardEvents: number
  dateRange: {
    earliest: Date | null
    latest: Date | null
  }
  topPrecedents: Array<{
    id: string
    title: string
    precedentValue: number
    citedByCount: number
  }>
}

export interface TimelineViewerProps {
  events: TimelineEvent[]
  stats: TimelineStats
  onFilter?: (filters: TimelineFilters) => void
  className?: string
}

export interface TimelineFilters {
  domain?: string
  tribunalCode?: string
  eventType?: EventType
  dateFrom?: Date
  dateTo?: Date
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const EVENT_TYPE_CONFIG = {
  major_shift: {
    icon: TrendingUp,
    label: 'Revirement Jurisprudentiel',
    labelAr: 'نقض',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950',
    borderColor: 'border-red-300 dark:border-red-700',
    badgeVariant: 'destructive' as const,
  },
  confirmation: {
    icon: CheckCircle2,
    label: 'Confirmation',
    labelAr: 'تأكيد',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    borderColor: 'border-green-300 dark:border-green-700',
    badgeVariant: 'default' as const,
  },
  nuance: {
    icon: AlertTriangle,
    label: 'Distinction/Précision',
    labelAr: 'تمييز',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950',
    borderColor: 'border-amber-300 dark:border-amber-700',
    badgeVariant: 'secondary' as const,
  },
  standard: {
    icon: FileText,
    label: 'Arrêt Standard',
    labelAr: 'قرار عادي',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    borderColor: 'border-blue-300 dark:border-blue-700',
    badgeVariant: 'outline' as const,
  },
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function TimelineViewer({
  events,
  stats,
  onFilter,
  className = '',
}: TimelineViewerProps) {
  const [filters, setFilters] = useState<TimelineFilters>({})
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const handleFilterChange = (key: keyof TimelineFilters, value: any) => {
    const newFilters = { ...filters, [key]: value }
    setFilters(newFilters)
    onFilter?.(newFilters)
  }

  const clearFilters = () => {
    setFilters({})
    onFilter?.({})
  }

  // Grouper événements par année
  const eventsByYear = groupEventsByYear(events)

  // Filtres actifs count
  const activeFiltersCount = Object.values(filters).filter(v => v !== undefined).length

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header avec statistiques */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Timeline Jurisprudence Tunisienne
            </CardTitle>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Statistiques */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.totalEvents}</div>
              <div className="text-sm text-muted-foreground">Total Événements</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{stats.majorShifts}</div>
              <div className="text-sm text-muted-foreground">Revirements</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.confirmations}</div>
              <div className="text-sm text-muted-foreground">Confirmations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{stats.nuances}</div>
              <div className="text-sm text-muted-foreground">Distinctions</div>
            </div>
          </div>

          {/* Filtres */}
          {showFilters && (
            <div className="pt-4 border-t space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  value={filters.domain}
                  onValueChange={(value) => handleFilterChange('domain', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Domaine Juridique" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="civil">Civil</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                    <SelectItem value="penal">Pénal</SelectItem>
                    <SelectItem value="famille">Famille</SelectItem>
                    <SelectItem value="travail">Travail</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.tribunalCode}
                  onValueChange={(value) => handleFilterChange('tribunalCode', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tribunal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cassation">Cour de Cassation</SelectItem>
                    <SelectItem value="appel">Cour d'Appel</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.eventType}
                  onValueChange={(value) => handleFilterChange('eventType', value as EventType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Type d'Événement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="major_shift">Revirement</SelectItem>
                    <SelectItem value="confirmation">Confirmation</SelectItem>
                    <SelectItem value="nuance">Distinction</SelectItem>
                    <SelectItem value="standard">Standard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Effacer filtres
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Légende */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            {Object.entries(EVENT_TYPE_CONFIG).map(([type, config]) => (
              <div key={type} className="flex items-center gap-2">
                <config.icon className={`h-4 w-4 ${config.color}`} />
                <span className="text-sm">{config.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Timeline par année */}
      {Object.keys(eventsByYear).length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Aucun événement trouvé. Essayez de modifier les filtres.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(eventsByYear)
            .sort(([yearA], [yearB]) => parseInt(yearB) - parseInt(yearA))
            .map(([year, yearEvents]) => (
              <div key={year}>
                <div className="sticky top-0 z-10 bg-background py-2 mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <div className="h-px bg-border flex-1" />
                    <span className="px-4">{year}</span>
                    <div className="h-px bg-border flex-1" />
                  </h3>
                </div>

                <div className="space-y-3 pl-8 border-l-2 border-muted">
                  {yearEvents
                    .sort((a, b) => (b.decisionDate?.getTime() || 0) - (a.decisionDate?.getTime() || 0))
                    .map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => setSelectedEvent(event)}
                      />
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Modal détail événement */}
      {selectedEvent && (
        <EventCard
          event={selectedEvent}
          isModal={true}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  )
}

// =============================================================================
// HELPERS
// =============================================================================

function groupEventsByYear(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  return events.reduce((acc, event) => {
    if (!event.decisionDate) return acc

    const year = event.decisionDate.getFullYear().toString()

    if (!acc[year]) {
      acc[year] = []
    }

    acc[year].push(event)

    return acc
  }, {} as Record<string, TimelineEvent[]>)
}
