/**
 * Hook React Query pour Recherche RAG
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Remplace les appels fetch() directs par React Query avec cache intelligent.
 * Gain attendu : -30 à -50% réponses API grâce au cache
 */

'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// =============================================================================
// TYPES (locaux — correspondent à la réponse API /api/client/kb/search)
// =============================================================================

export interface RAGSearchParams {
  question: string
  filters?: {
    category?: string
    domain?: string
    tribunal?: string
    chambre?: string
    language?: 'fr' | 'ar' | 'bi'
    dateFrom?: string
    dateTo?: string
  }
  limit?: number
  includeRelations?: boolean
  sortBy?: 'relevance' | 'date' | 'citations'
}

export interface RAGSearchResult {
  success: boolean
  results?: Array<{
    kbId: string
    title: string
    category: string
    similarity: number
    chunkContent?: string
    metadata: Record<string, unknown>
    relations?: Record<string, unknown>
  }>
  pagination?: {
    total: number
    limit: number
    hasMore: boolean
  }
  metadata?: {
    processingTimeMs: number
    cacheHit: boolean
  }
}

export interface UseRAGSearchParams {
  filters?: RAGSearchParams['filters']
  limit?: number
  includeRelations?: boolean
  sortBy?: string
  enabled?: boolean
  staleTime?: number
  cacheTime?: number
  refetchOnMount?: boolean
  refetchOnWindowFocus?: boolean
}

export interface UseRAGSearchResult {
  data: RAGSearchResult | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export interface UseRAGMutationParams {
  onSuccess?: (data: RAGSearchResult) => void
  onError?: (error: Error) => void
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const ragSearchKeys = {
  all: ['rag-search'] as const,
  searches: () => [...ragSearchKeys.all, 'searches'] as const,
  search: (question: string, params?: Partial<RAGSearchParams>) =>
    [...ragSearchKeys.searches(), { question, ...params }] as const,
  recent: () => [...ragSearchKeys.all, 'recent'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function searchRAG(
  question: string,
  params?: Partial<RAGSearchParams>
): Promise<RAGSearchResult> {
  const response = await fetch('/api/client/kb/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: question,
      ...params,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur inconnue' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  return response.json()
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour recherche RAG avec cache automatique
 *
 * Usage :
 * ```tsx
 * const { data, isLoading, error } = useRAGSearch('prescription civile', {
 *   filters: { category: 'codes' },
 *   limit: 20,
 *   enabled: query.length > 0,
 * })
 * ```
 */
export function useRAGSearch(
  question: string,
  params?: UseRAGSearchParams
): UseRAGSearchResult {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 30 * 60 * 1000, // 30 minutes
    refetchOnMount = false,
    refetchOnWindowFocus = false,
    ...searchParams
  } = params || {}

  const ragParams = searchParams as Partial<RAGSearchParams>
  const query = useQuery({
    queryKey: ragSearchKeys.search(question, ragParams),
    queryFn: () => searchRAG(question, ragParams),
    enabled: enabled && question.length > 0,
    staleTime,
    gcTime: cacheTime,
    refetchOnMount,
    refetchOnWindowFocus,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Hook pour recherche RAG avec mutation (pour formulaires)
 *
 * Usage :
 * ```tsx
 * const { mutate, isLoading } = useRAGSearchMutation({
 *   onSuccess: (data) => console.log('Résultats:', data.results.length),
 * })
 *
 * const handleSubmit = (question: string) => {
 *   mutate({ question, filters: { category: 'jurisprudence' } })
 * }
 * ```
 */
export function useRAGSearchMutation(params?: UseRAGMutationParams) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ question, ...searchParams }: RAGSearchParams) =>
      searchRAG(question, searchParams),
    onSuccess: (data, variables) => {
      // Update cache with new result
      queryClient.setQueryData(ragSearchKeys.search(variables.question, variables), data)

      // Invalidate recent searches to include this new one
      queryClient.invalidateQueries({ queryKey: ragSearchKeys.recent() })

      // Call user callback
      params?.onSuccess?.(data)
    },
    onError: params?.onError,
  })
}

/**
 * Hook pour préchargement de recherche RAG (hover sur lien, etc.)
 *
 * Usage :
 * ```tsx
 * const prefetch = usePrefetchRAGSearch()
 *
 * <Link
 *   href="/recherche"
 *   onMouseEnter={() => prefetch('prescription civile')}
 * >
 *   Voir résultats
 * </Link>
 * ```
 */
export function usePrefetchRAGSearch() {
  const queryClient = useQueryClient()

  return (question: string, params?: Partial<RAGSearchParams>) => {
    queryClient.prefetchQuery({
      queryKey: ragSearchKeys.search(question, params),
      queryFn: () => searchRAG(question, params),
      staleTime: 5 * 60 * 1000, // 5 minutes
    })
  }
}

/**
 * Hook pour invalider cache RAG (après update KB, etc.)
 *
 * Usage :
 * ```tsx
 * const invalidate = useInvalidateRAGCache()
 *
 * const handleKBUpdate = async () => {
 *   await updateKB()
 *   invalidate() // Force refetch de toutes les recherches
 * }
 * ```
 */
export function useInvalidateRAGCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: ragSearchKeys.all })
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached RAG search result without triggering a fetch
 */
export function getCachedRAGSearch(
  queryClient: ReturnType<typeof useQueryClient>,
  question: string,
  params?: Partial<RAGSearchParams>
): RAGSearchResult | undefined {
  return queryClient.getQueryData(ragSearchKeys.search(question, params))
}

/**
 * Set RAG search result in cache manually
 */
export function setCachedRAGSearch(
  queryClient: ReturnType<typeof useQueryClient>,
  question: string,
  data: RAGSearchResult,
  params?: Partial<RAGSearchParams>
): void {
  queryClient.setQueryData(ragSearchKeys.search(question, params), data)
}
