/**
 * Hook React Query pour Documents Knowledge Base
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Gestion cache des documents KB, métadonnées, relations juridiques.
 * Gain attendu : -50% requêtes DB grâce au cache local
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// =============================================================================
// TYPES
// =============================================================================

export interface KBDocument {
  id: string
  title: string
  category: string
  domain?: string
  tribunal?: string
  chambre?: string
  date?: Date
  content: string
  metadata: {
    reference?: string
    numeroArret?: string
    parties?: string
    citations?: number
    precedentScore?: number
  }
  language: 'fr' | 'ar'
  createdAt: Date
  updatedAt: Date
}

export interface KBDocumentRelations {
  overrules: KBDocument[]
  confirms: KBDocument[]
  distinguishes: KBDocument[]
  relatedLegislation: KBDocument[]
  relatedDoctrine: KBDocument[]
}

export interface KBDocumentFilters {
  category?: string
  domain?: string
  tribunal?: string
  chambre?: string
  language?: 'fr' | 'ar'
  dateFrom?: Date
  dateTo?: Date
  minPrecedentScore?: number
}

export interface KBDocumentListParams {
  filters?: KBDocumentFilters
  sortBy?: 'date' | 'relevance' | 'citations' | 'precedentScore'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface KBDocumentListResult {
  documents: KBDocument[]
  total: number
  hasMore: boolean
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const kbDocumentKeys = {
  all: ['kb-documents'] as const,
  lists: () => [...kbDocumentKeys.all, 'list'] as const,
  list: (params?: KBDocumentListParams) => [...kbDocumentKeys.lists(), params] as const,
  details: () => [...kbDocumentKeys.all, 'detail'] as const,
  detail: (id: string) => [...kbDocumentKeys.details(), id] as const,
  relations: (id: string) => [...kbDocumentKeys.detail(id), 'relations'] as const,
  recent: () => [...kbDocumentKeys.all, 'recent'] as const,
  stats: () => [...kbDocumentKeys.all, 'stats'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchKBDocument(id: string): Promise<KBDocument> {
  const response = await fetch(`/api/client/kb/documents/${id}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Document non trouvé' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // Convert date strings to Date objects
  return {
    ...data,
    date: data.date ? new Date(data.date) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function fetchKBDocumentRelations(id: string): Promise<KBDocumentRelations> {
  const response = await fetch(`/api/client/kb/documents/${id}/relations`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Relations non trouvées' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

async function fetchKBDocumentList(
  params?: KBDocumentListParams
): Promise<KBDocumentListResult> {
  const searchParams = new URLSearchParams()

  if (params?.filters) {
    Object.entries(params.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    })
  }

  if (params?.sortBy) searchParams.set('sortBy', params.sortBy)
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder)
  if (params?.limit) searchParams.set('limit', String(params.limit))
  if (params?.offset) searchParams.set('offset', String(params.offset))

  const response = await fetch(`/api/client/kb/documents?${searchParams.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    documents: data.documents.map((doc: any) => ({
      ...doc,
      date: doc.date ? new Date(doc.date) : undefined,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    })),
    total: data.total,
    hasMore: data.hasMore,
  }
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour charger un document KB par ID
 *
 * Usage :
 * ```tsx
 * const { data: document, isLoading } = useKBDocument('doc-123')
 * ```
 */
export function useKBDocument(
  id: string,
  options?: {
    enabled?: boolean
    staleTime?: number
    cacheTime?: number
  }
) {
  const { enabled = true, staleTime = 10 * 60 * 1000, cacheTime = 60 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: kbDocumentKeys.detail(id),
    queryFn: () => fetchKBDocument(id),
    enabled: enabled && !!id,
    staleTime,
    gcTime: cacheTime,
  })
}

/**
 * Hook pour charger les relations juridiques d'un document
 *
 * Usage :
 * ```tsx
 * const { data: relations } = useKBDocumentRelations('doc-123')
 *
 * // Accès aux relations
 * relations?.overrules // Documents renversés
 * relations?.confirms // Documents confirmés
 * relations?.distinguishes // Documents distingués
 * ```
 */
export function useKBDocumentRelations(
  id: string,
  options?: {
    enabled?: boolean
    staleTime?: number
  }
) {
  const { enabled = true, staleTime = 10 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: kbDocumentKeys.relations(id),
    queryFn: () => fetchKBDocumentRelations(id),
    enabled: enabled && !!id,
    staleTime,
  })
}

/**
 * Hook pour liste de documents KB avec filtres
 *
 * Usage :
 * ```tsx
 * const { data, isLoading, fetchNextPage, hasNextPage } = useKBDocumentList({
 *   filters: { category: 'jurisprudence', domain: 'civil' },
 *   sortBy: 'precedentScore',
 *   limit: 20,
 * })
 * ```
 */
export function useKBDocumentList(params?: KBDocumentListParams) {
  return useQuery({
    queryKey: kbDocumentKeys.list(params),
    queryFn: () => fetchKBDocumentList(params),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  })
}

/**
 * Hook pour infinite scroll de documents KB
 *
 * Usage :
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useKBDocumentInfiniteList({ filters: { category: 'codes' } })
 *
 * // Dans le composant
 * <InfiniteScroll
 *   loadMore={fetchNextPage}
 *   hasMore={hasNextPage}
 * >
 *   {data?.pages.map(page =>
 *     page.documents.map(doc => <DocumentCard key={doc.id} {...doc} />)
 *   )}
 * </InfiniteScroll>
 * ```
 */
export function useKBDocumentInfiniteList(
  params?: Omit<KBDocumentListParams, 'offset'>
) {
  const { useInfiniteQuery } = require('@tanstack/react-query')

  return useInfiniteQuery({
    queryKey: kbDocumentKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      fetchKBDocumentList({
        ...params,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: KBDocumentListResult, allPages: KBDocumentListResult[]) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * (params?.limit || 20)
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Hook pour préchargement document KB (hover, etc.)
 *
 * Usage :
 * ```tsx
 * const prefetch = usePrefetchKBDocument()
 *
 * <DocumentCard
 *   onMouseEnter={() => prefetch(doc.id)}
 * />
 * ```
 */
export function usePrefetchKBDocument() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: kbDocumentKeys.detail(id),
      queryFn: () => fetchKBDocument(id),
      staleTime: 10 * 60 * 1000,
    })
  }
}

/**
 * Hook pour préchargement relations (hover "Voir relations")
 */
export function usePrefetchKBDocumentRelations() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: kbDocumentKeys.relations(id),
      queryFn: () => fetchKBDocumentRelations(id),
      staleTime: 10 * 60 * 1000,
    })
  }
}

/**
 * Hook pour invalider cache KB (après indexation, update)
 */
export function useInvalidateKBCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: kbDocumentKeys.all })
  }
}

/**
 * Hook pour mutation update document (admin)
 */
export function useUpdateKBDocument(options?: {
  onSuccess?: (data: KBDocument) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<KBDocument> & { id: string }) => {
      const response = await fetch(`/api/admin/kb/documents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erreur de mise à jour' }))
        throw new Error(error.error)
      }

      return response.json()
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(kbDocumentKeys.detail(data.id), data)
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: kbDocumentKeys.lists() })
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached document without triggering fetch
 */
export function getCachedKBDocument(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
): KBDocument | undefined {
  return queryClient.getQueryData(kbDocumentKeys.detail(id))
}

/**
 * Set document in cache manually
 */
export function setCachedKBDocument(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  data: KBDocument
): void {
  queryClient.setQueryData(kbDocumentKeys.detail(id), data)
}
