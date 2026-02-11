/**
 * Hook React Query pour Timeline Jurisprudentielle
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Gestion cache événements timeline, statistiques, filtres.
 * Gain attendu : -40% requêtes API grâce au cache intelligent
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  TimelineEvent,
  TimelineStats,
  TimelineFilters,
  EventType,
} from '@/components/client/jurisprudence/TimelineViewer'

// =============================================================================
// TYPES
// =============================================================================

export interface TimelineQueryParams {
  filters?: TimelineFilters
  limit?: number
  offset?: number
  includeStats?: boolean
}

export interface TimelineQueryResult {
  events: TimelineEvent[]
  stats?: TimelineStats
  total: number
  hasMore: boolean
}

export interface UseTimelineOptions {
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  refetchOnMount?: boolean
  refetchOnWindowFocus?: boolean
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const timelineKeys = {
  all: ['jurisprudence-timeline'] as const,
  lists: () => [...timelineKeys.all, 'list'] as const,
  list: (params?: TimelineQueryParams) => [...timelineKeys.lists(), params] as const,
  events: () => [...timelineKeys.all, 'events'] as const,
  event: (id: string) => [...timelineKeys.events(), id] as const,
  stats: (filters?: TimelineFilters) => [...timelineKeys.all, 'stats', filters] as const,
  years: () => [...timelineKeys.all, 'years'] as const,
  domains: () => [...timelineKeys.all, 'domains'] as const,
  tribunals: () => [...timelineKeys.all, 'tribunals'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchTimeline(params?: TimelineQueryParams): Promise<TimelineQueryResult> {
  const searchParams = new URLSearchParams()

  if (params?.filters) {
    Object.entries(params.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.set(key, value.join(','))
        } else if (value instanceof Date) {
          searchParams.set(key, value.toISOString())
        } else {
          searchParams.set(key, String(value))
        }
      }
    })
  }

  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))
  if (params?.includeStats) searchParams.set('includeStats', 'true')

  const response = await fetch(
    `/api/client/jurisprudence/timeline?${searchParams.toString()}`
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // Convert date strings to Date objects
  return {
    events: data.events.map((event: any) => ({
      ...event,
      date: new Date(event.date),
      metadata: {
        ...event.metadata,
        dateDecision: event.metadata.dateDecision
          ? new Date(event.metadata.dateDecision)
          : undefined,
      },
    })),
    stats: data.stats,
    total: data.total,
    hasMore: data.hasMore,
  }
}

async function fetchTimelineEvent(id: string): Promise<TimelineEvent> {
  const response = await fetch(`/api/client/jurisprudence/events/${id}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Événement non trouvé' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    ...data,
    date: new Date(data.date),
    metadata: {
      ...data.metadata,
      dateDecision: data.metadata.dateDecision ? new Date(data.metadata.dateDecision) : undefined,
    },
  }
}

async function fetchTimelineStats(filters?: TimelineFilters): Promise<TimelineStats> {
  const searchParams = new URLSearchParams()

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          searchParams.set(key, value.join(','))
        } else {
          searchParams.set(key, String(value))
        }
      }
    })
  }

  const response = await fetch(
    `/api/client/jurisprudence/timeline/stats?${searchParams.toString()}`
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Statistiques non trouvées' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour charger timeline jurisprudentielle avec filtres
 *
 * Usage :
 * ```tsx
 * const { data, isLoading } = useJurisprudenceTimeline({
 *   filters: { domain: 'civil', eventType: ['major_shift', 'confirmation'] },
 *   limit: 100,
 *   includeStats: true,
 * })
 *
 * // Accès aux données
 * data?.events // TimelineEvent[]
 * data?.stats // TimelineStats
 * ```
 */
export function useJurisprudenceTimeline(
  params?: TimelineQueryParams,
  options?: UseTimelineOptions
) {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 30 * 60 * 1000, // 30 minutes
    refetchOnMount = false,
    refetchOnWindowFocus = false,
  } = options || {}

  return useQuery({
    queryKey: timelineKeys.list(params),
    queryFn: () => fetchTimeline(params),
    enabled,
    staleTime,
    gcTime: cacheTime,
    refetchOnMount,
    refetchOnWindowFocus,
  })
}

/**
 * Hook pour charger un événement timeline par ID
 *
 * Usage :
 * ```tsx
 * const { data: event } = useTimelineEvent('event-123')
 * ```
 */
export function useTimelineEvent(id: string, options?: UseTimelineOptions) {
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000,
    cacheTime = 60 * 60 * 1000,
  } = options || {}

  return useQuery({
    queryKey: timelineKeys.event(id),
    queryFn: () => fetchTimelineEvent(id),
    enabled: enabled && !!id,
    staleTime,
    gcTime: cacheTime,
  })
}

/**
 * Hook pour statistiques timeline (séparé pour cache indépendant)
 *
 * Usage :
 * ```tsx
 * const { data: stats } = useTimelineStats({
 *   domain: 'civil',
 *   yearRange: { start: 2020, end: 2025 },
 * })
 *
 * // Accès aux stats
 * stats?.totalEvents
 * stats?.majorShifts
 * stats?.byYear // Record<number, number>
 * ```
 */
export function useTimelineStats(filters?: TimelineFilters, options?: UseTimelineOptions) {
  const {
    enabled = true,
    staleTime = 10 * 60 * 1000,
    cacheTime = 60 * 60 * 1000,
  } = options || {}

  return useQuery({
    queryKey: timelineKeys.stats(filters),
    queryFn: () => fetchTimelineStats(filters),
    enabled,
    staleTime,
    gcTime: cacheTime,
  })
}

/**
 * Hook pour infinite scroll timeline
 *
 * Usage :
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useTimelineInfiniteScroll({
 *   filters: { domain: 'commercial' },
 *   limit: 50,
 * })
 * ```
 */
export function useTimelineInfiniteScroll(
  params?: Omit<TimelineQueryParams, 'offset'>,
  options?: UseTimelineOptions
) {
  const { useInfiniteQuery } = require('@tanstack/react-query')
  const { staleTime = 5 * 60 * 1000 } = options || {}

  return useInfiniteQuery({
    queryKey: timelineKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      fetchTimeline({
        ...params,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: TimelineQueryResult, allPages: TimelineQueryResult[]) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * (params?.limit || 50)
    },
    staleTime,
  })
}

/**
 * Hook pour préchargement événement timeline (hover)
 *
 * Usage :
 * ```tsx
 * const prefetch = usePrefetchTimelineEvent()
 *
 * <EventCard
 *   onMouseEnter={() => prefetch(event.id)}
 * />
 * ```
 */
export function usePrefetchTimelineEvent() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: timelineKeys.event(id),
      queryFn: () => fetchTimelineEvent(id),
      staleTime: 10 * 60 * 1000,
    })
  }
}

/**
 * Hook pour préchargement timeline avec filtres
 *
 * Usage :
 * ```tsx
 * const prefetch = usePrefetchTimeline()
 *
 * <FilterButton
 *   onMouseEnter={() => prefetch({ filters: { domain: 'penal' } })}
 * >
 *   Droit Pénal
 * </FilterButton>
 * ```
 */
export function usePrefetchTimeline() {
  const queryClient = useQueryClient()

  return (params?: TimelineQueryParams) => {
    queryClient.prefetchQuery({
      queryKey: timelineKeys.list(params),
      queryFn: () => fetchTimeline(params),
      staleTime: 5 * 60 * 1000,
    })
  }
}

/**
 * Hook pour invalider cache timeline (après update KB)
 */
export function useInvalidateTimelineCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: timelineKeys.all })
  }
}

/**
 * Hook pour filtrage local événements (optimiste, sans API)
 *
 * Usage :
 * ```tsx
 * const { data } = useJurisprudenceTimeline()
 * const filtered = useFilteredEvents(data?.events, {
 *   domain: 'civil',
 *   eventType: ['major_shift'],
 * })
 * ```
 */
export function useFilteredEvents(
  events: TimelineEvent[] | undefined,
  filters: TimelineFilters
): TimelineEvent[] {
  if (!events) return []

  return events.filter((event) => {
    // Filter by domain
    if (filters.domain && event.domain !== filters.domain) {
      return false
    }

    // Filter by tribunal
    if (filters.tribunalCode && event.tribunalCode !== filters.tribunalCode) {
      return false
    }

    // Filter by eventType
    if (filters.eventType && event.eventType !== filters.eventType) {
      return false
    }

    // Filter by date range
    if (filters.dateFrom && event.decisionDate && event.decisionDate < filters.dateFrom) {
      return false
    }
    if (filters.dateTo && event.decisionDate && event.decisionDate > filters.dateTo) {
      return false
    }

    return true
  })
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached timeline without triggering fetch
 */
export function getCachedTimeline(
  queryClient: ReturnType<typeof useQueryClient>,
  params?: TimelineQueryParams
): TimelineQueryResult | undefined {
  return queryClient.getQueryData(timelineKeys.list(params))
}

/**
 * Set timeline in cache manually
 */
export function setCachedTimeline(
  queryClient: ReturnType<typeof useQueryClient>,
  params: TimelineQueryParams,
  data: TimelineQueryResult
): void {
  queryClient.setQueryData(timelineKeys.list(params), data)
}

/**
 * Group events by year (helper for timeline display)
 */
export function groupEventsByYear(
  events: TimelineEvent[]
): Record<number, TimelineEvent[]> {
  return events.reduce(
    (acc, event) => {
      const year = event.decisionDate?.getFullYear() || 0
      if (!acc[year]) acc[year] = []
      acc[year].push(event)
      return acc
    },
    {} as Record<number, TimelineEvent[]>
  )
}
