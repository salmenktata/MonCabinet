/**
 * Composant Timeline Jurisprudentielle Tunisienne (Phase 4.3)
 *
 * Visualisation interactive de l'évolution de la jurisprudence tunisienne
 * avec identification des arrêts clés et événements majeurs.
 *
 * @module components/super-admin/JurisprudenceGraph
 */

'use client'

import { useState, useEffect } from 'react'
import { Calendar, Filter, TrendingUp, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import type { TimelineEvent, TimelineResult, EventType } from '@/lib/ai/jurisprudence-timeline-service'

// =============================================================================
// TYPES
// =============================================================================

interface JurisprudenceGraphProps {
  initialData?: TimelineResult
  onEventClick?: (event: TimelineEvent) => void
  className?: string
}

interface TimelineFilters {
  domain: string
  dateFrom: string
  dateTo: string
  minCitedBy: number
  eventTypes: EventType[]
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function JurisprudenceGraph({
  initialData,
  onEventClick,
  className = '',
}: JurisprudenceGraphProps) {
  const [timelineData, setTimelineData] = useState<TimelineResult | null>(initialData || null)
  const [loading, setLoading] = useState(!initialData)
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null)
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 })

  const [filters, setFilters] = useState<TimelineFilters>({
    domain: 'all',
    dateFrom: '',
    dateTo: '',
    minCitedBy: 0,
    eventTypes: ['major_shift', 'confirmation', 'nuance', 'standard'],
  })

  // Charger données initiales si non fournies
  useEffect(() => {
    if (!initialData) {
      loadTimelineData()
    }
  }, [])

  async function loadTimelineData() {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/jurisprudence-timeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: filters.domain !== 'all' ? filters.domain : undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          minCitedBy: filters.minCitedBy,
        }),
      })

      if (response.ok) {
        const data: TimelineResult = await response.json()
        setTimelineData(data)
      }
    } catch (error) {
      console.error('[JurisprudenceGraph] Erreur chargement timeline:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filtrer événements par type
  const filteredEvents = timelineData?.events.filter(event =>
    filters.eventTypes.includes(event.eventType)
  ) || []

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="text-center">
          <div className="mb-2 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground/80">
            Chargement timeline jurisprudence...
          </p>
        </div>
      </div>
    )
  }

  if (!timelineData || filteredEvents.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
        <Info className="mx-auto mb-2 h-12 w-12 text-muted-foreground/80" />
        <p className="text-muted-foreground dark:text-muted-foreground/80">
          Aucun événement jurisprudentiel trouvé pour les filtres sélectionnés
        </p>
      </div>
    )
  }

  return (
    <div className={`jurisprudence-graph ${className}`}>
      {/* Header avec stats */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 p-4 dark:border-gray-700 dark:from-blue-900/20 dark:to-purple-900/20">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="h-5 w-5 text-blue-600" />
            Timeline Jurisprudence Tunisienne
          </h3>

          <button
            onClick={loadTimelineData}
            className="rounded px-3 py-1 text-sm hover:bg-white/50 dark:hover:bg-gray-800/50"
          >
            Actualiser
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Total"
            value={timelineData.stats.totalEvents}
            color="text-blue-600"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Revirements"
            value={timelineData.stats.majorShifts}
            color="text-red-600"
          />
          <StatCard
            icon={<CheckCircle className="h-4 w-4" />}
            label="Confirmations"
            value={timelineData.stats.confirmations}
            color="text-green-600"
          />
          <StatCard
            icon={<Info className="h-4 w-4" />}
            label="Distinctions"
            value={timelineData.stats.nuances}
            color="text-blue-600"
          />
          <StatCard
            icon={<Filter className="h-4 w-4" />}
            label="Standard"
            value={timelineData.stats.standardEvents}
            color="text-muted-foreground"
          />
        </div>

        {/* Période */}
        {timelineData.stats.dateRange.earliest && (
          <p className="mt-2 text-xs text-muted-foreground dark:text-muted-foreground/80">
            Période :{' '}
            {new Date(timelineData.stats.dateRange.earliest).toLocaleDateString('fr-FR')} →{' '}
            {timelineData.stats.dateRange.latest
              ? new Date(timelineData.stats.dateRange.latest).toLocaleDateString('fr-FR')
              : 'N/A'}
          </p>
        )}
      </div>

      {/* Filtres */}
      <TimelineFilters
        filters={filters}
        onFiltersChange={setFilters}
        onApply={loadTimelineData}
      />

      {/* Légende */}
      <div className="mb-4 flex flex-wrap gap-3">
        <LegendItem color="bg-red-500" label="Revirement (نقض)" />
        <LegendItem color="bg-green-500" label="Confirmation (تأكيد)" />
        <LegendItem color="bg-blue-500" label="Distinction (تمييز)" />
        <LegendItem color="bg-gray-400" label="Standard" />
      </div>

      {/* Timeline SVG */}
      <div className="relative rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
        <TimelineSVG
          events={filteredEvents}
          onEventHover={(event, x, y) => {
            setHoveredEvent(event)
            setHoverPosition({ x, y })
          }}
          onEventLeave={() => setHoveredEvent(null)}
          onEventClick={onEventClick}
        />

        {/* Popup hover */}
        {hoveredEvent && (
          <EventPopup
            event={hoveredEvent}
            position={hoverPosition}
          />
        )}
      </div>

      {/* Top précédents */}
      <div className="mt-6">
        <h4 className="mb-3 font-semibold">Top 10 Arrêts Influents (PageRank)</h4>
        <div className="grid gap-2">
          {timelineData.stats.topPrecedents.map((precedent, i) => (
            <div
              key={precedent.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-sm">{precedent.title.substring(0, 80)}...</span>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground dark:text-muted-foreground/80">
                <span>Score: {precedent.precedentValue.toFixed(3)}</span>
                <span>{precedent.citedByCount} citations</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANTS AUXILIAIRES
// =============================================================================

/**
 * Card statistique
 */
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-lg bg-white p-3 dark:bg-gray-800">
      <div className="mb-1 flex items-center gap-1">
        <span className={color}>{icon}</span>
        <span className="text-xs text-muted-foreground dark:text-muted-foreground/80">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

/**
 * Filtres timeline
 */
function TimelineFilters({
  filters,
  onFiltersChange,
  onApply,
}: {
  filters: TimelineFilters
  onFiltersChange: (filters: TimelineFilters) => void
  onApply: () => void
}) {
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Filtres</span>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground/80">
            Domaine
          </label>
          <select
            value={filters.domain}
            onChange={e => onFiltersChange({ ...filters, domain: e.target.value })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
          >
            <option value="all">Tous</option>
            <option value="civil">Droit Civil</option>
            <option value="penal">Droit Pénal</option>
            <option value="commercial">Droit Commercial</option>
            <option value="administratif">Droit Administratif</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground/80">
            Date début
          </label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => onFiltersChange({ ...filters, dateFrom: e.target.value })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground/80">
            Date fin
          </label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => onFiltersChange({ ...filters, dateTo: e.target.value })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground dark:text-muted-foreground/80">
            Min citations
          </label>
          <input
            type="number"
            min="0"
            value={filters.minCitedBy}
            onChange={e => onFiltersChange({ ...filters, minCitedBy: parseInt(e.target.value) || 0 })}
            className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-700"
          />
        </div>
      </div>

      <button
        onClick={onApply}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Appliquer filtres
      </button>
    </div>
  )
}

/**
 * Légende timeline
 */
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-3 w-3 rounded-full ${color}`}></div>
      <span className="text-xs text-muted-foreground dark:text-muted-foreground/80">{label}</span>
    </div>
  )
}

/**
 * Timeline SVG
 */
function TimelineSVG({
  events,
  onEventHover,
  onEventLeave,
  onEventClick,
}: {
  events: TimelineEvent[]
  onEventHover: (event: TimelineEvent, x: number, y: number) => void
  onEventLeave: () => void
  onEventClick?: (event: TimelineEvent) => void
}) {
  if (events.length === 0) return null

  // Dimensions
  const width = 1000
  const height = 400
  const marginTop = 40
  const marginBottom = 60
  const marginLeft = 60
  const marginRight = 60

  // Échelle temporelle
  const datesValid = events.filter(e => e.decisionDate !== null)
  if (datesValid.length === 0) return null

  const minDate = Math.min(...datesValid.map(e => e.decisionDate!.getTime()))
  const maxDate = Math.max(...datesValid.map(e => e.decisionDate!.getTime()))

  const timeScale = (date: Date) => {
    const t = date.getTime()
    return marginLeft + ((t - minDate) / (maxDate - minDate)) * (width - marginLeft - marginRight)
  }

  // Grouper par type pour répartition verticale
  const eventsByType = {
    major_shift: events.filter(e => e.eventType === 'major_shift'),
    confirmation: events.filter(e => e.eventType === 'confirmation'),
    nuance: events.filter(e => e.eventType === 'nuance'),
    standard: events.filter(e => e.eventType === 'standard'),
  }

  const yLevels = {
    major_shift: marginTop + 50,
    confirmation: marginTop + 120,
    nuance: marginTop + 190,
    standard: marginTop + 260,
  }

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {/* Axe horizontal */}
      <line
        x1={marginLeft}
        y1={height - marginBottom}
        x2={width - marginRight}
        y2={height - marginBottom}
        stroke="currentColor"
        strokeWidth="2"
        className="text-gray-300 dark:text-muted-foreground"
      />

      {/* Labels dates */}
      <text
        x={marginLeft}
        y={height - marginBottom + 20}
        className="fill-current text-xs text-muted-foreground dark:text-muted-foreground/80"
      >
        {new Date(minDate).getFullYear()}
      </text>
      <text
        x={width - marginRight - 30}
        y={height - marginBottom + 20}
        className="fill-current text-xs text-muted-foreground dark:text-muted-foreground/80"
      >
        {new Date(maxDate).getFullYear()}
      </text>

      {/* Événements par type */}
      {Object.entries(eventsByType).map(([type, typeEvents]) => {
        const y = yLevels[type as EventType]

        return (
          <g key={type}>
            {/* Ligne horizontale type */}
            <line
              x1={marginLeft}
              y1={y}
              x2={width - marginRight}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="4 4"
              className="text-gray-200 dark:text-gray-700"
            />

            {/* Points événements */}
            {typeEvents.map(event => {
              if (!event.decisionDate) return null

              const x = timeScale(event.decisionDate)
              const color = getEventColor(event.eventType)
              const radius = event.precedentValue > 0.5 ? 8 : event.citedByCount > 5 ? 7 : 5

              return (
                <circle
                  key={event.id}
                  cx={x}
                  cy={y}
                  r={radius}
                  className={`${color} cursor-pointer transition-all hover:opacity-80`}
                  onMouseEnter={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    onEventHover(event, rect.left + rect.width / 2, rect.top)
                  }}
                  onMouseLeave={onEventLeave}
                  onClick={() => onEventClick?.(event)}
                />
              )
            })}
          </g>
        )
      })}

      {/* Labels types (gauche) */}
      <text x={10} y={yLevels.major_shift} className="fill-current text-xs font-semibold text-red-600">
        Revirements
      </text>
      <text x={10} y={yLevels.confirmation} className="fill-current text-xs font-semibold text-green-600">
        Confirmations
      </text>
      <text x={10} y={yLevels.nuance} className="fill-current text-xs font-semibold text-blue-600">
        Distinctions
      </text>
      <text x={10} y={yLevels.standard} className="fill-current text-xs font-semibold text-muted-foreground">
        Standard
      </text>
    </svg>
  )
}

/**
 * Couleur événement selon type
 */
function getEventColor(type: EventType): string {
  switch (type) {
    case 'major_shift':
      return 'fill-red-500'
    case 'confirmation':
      return 'fill-green-500'
    case 'nuance':
      return 'fill-blue-500'
    case 'standard':
      return 'fill-gray-400'
    default:
      return 'fill-gray-400'
  }
}

/**
 * Popup hover événement
 */
function EventPopup({ event, position }: { event: TimelineEvent; position: { x: number; y: number } }) {
  return (
    <div
      className="pointer-events-none absolute z-50 w-80 rounded-lg border border-gray-300 bg-white p-3 shadow-lg dark:border-gray-600 dark:bg-gray-800"
      style={{
        left: `${position.x}px`,
        top: `${position.y - 10}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          {event.eventType === 'major_shift' && '🔴 Revirement'}
          {event.eventType === 'confirmation' && '🟢 Confirmation'}
          {event.eventType === 'nuance' && '🔵 Distinction'}
          {event.eventType === 'standard' && '⚪ Standard'}
        </span>
        {event.decisionDate && (
          <span className="text-xs text-muted-foreground">
            {new Date(event.decisionDate).toLocaleDateString('fr-FR')}
          </span>
        )}
      </div>

      <h4 className="mb-2 text-sm font-semibold">{event.title}</h4>

      <div className="space-y-1 text-xs text-muted-foreground dark:text-muted-foreground/80">
        {event.decisionNumber && <p>📋 {event.decisionNumber}</p>}
        {event.tribunalLabel && <p>⚖️ {event.tribunalLabel}</p>}
        {event.chambreLabel && <p>🏛️ {event.chambreLabel}</p>}
        {event.solution && <p>✅ {event.solution}</p>}
        <p>📊 {event.citedByCount} citation(s)</p>
        {event.precedentValue > 0 && (
          <p>⭐ Score: {event.precedentValue.toFixed(3)}</p>
        )}
      </div>

      {event.eventDescription && (
        <p className="mt-2 text-xs italic text-muted-foreground">{event.eventDescription}</p>
      )}
    </div>
  )
}
