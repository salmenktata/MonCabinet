/**
 * Hook React Query pour Gestion Dossiers
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Gestion cache dossiers, clients, événements, documents.
 * Gain attendu : -50% requêtes API, UX instantanée navigation dossiers
 */

'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'

// =============================================================================
// TYPES
// =============================================================================

export interface Dossier {
  id: string
  userId: string
  clientId: string
  client?: Client
  titre: string
  numero?: string
  description?: string
  objet?: string
  type: DossierType
  status: DossierStatus
  statut?: string // Version originale DB pour compatibilité
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  category?: string
  numeroAffaire?: string
  juridiction?: string
  tribunal?: string
  dateOuverture?: Date
  dateCloture?: Date
  montant?: number
  montantLitige?: number
  devise?: string
  partieAdverse?: string
  avocatAdverse?: string
  numeroRg?: string
  workflowEtape?: string
  documents?: DossierDocument[]
  events?: DossierEvent[]
  actions?: any[] // Table actions
  echeances?: any[] // Table echeances
  notes?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export interface Client {
  id: string
  nom: string
  prenom?: string
  email?: string
  telephone?: string
  type: 'particulier' | 'entreprise'
  typeClient?: string // Version camelCase pour compatibilité API
  adresse?: string
}

export interface DossierDocument {
  id: string
  dossierId: string
  nom: string
  type: string
  url: string
  size: number
  uploadedAt: Date
}

export interface DossierEvent {
  id: string
  dossierId: string
  type: string
  titre: string
  description?: string
  date: Date
  createdAt: Date
}

export type DossierType =
  | 'civil'
  | 'penal'
  | 'commercial'
  | 'administratif'
  | 'travail'
  | 'famille'
  | 'autre'

export type DossierStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'pending'
  | 'closed'
  | 'archived'

export interface DossierListParams {
  clientId?: string
  type?: DossierType
  status?: DossierStatus
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  search?: string
  sortBy?: 'createdAt' | 'updatedAt' | 'dateOuverture' | 'priority'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface DossierListResult {
  dossiers: Dossier[]
  total: number
  hasMore: boolean
}

export interface CreateDossierParams {
  clientId: string
  titre: string
  description?: string
  type: DossierType
  status?: DossierStatus
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  category?: string
  numeroAffaire?: string
  juridiction?: string
  dateOuverture?: Date
  montant?: number
  devise?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface UpdateDossierParams extends Partial<CreateDossierParams> {
  id: string
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const dossierKeys = {
  all: ['dossiers'] as const,
  lists: () => [...dossierKeys.all, 'list'] as const,
  list: (params?: DossierListParams) => [...dossierKeys.lists(), params] as const,
  details: () => [...dossierKeys.all, 'detail'] as const,
  detail: (id: string) => [...dossierKeys.details(), id] as const,
  documents: (id: string) => [...dossierKeys.detail(id), 'documents'] as const,
  events: (id: string) => [...dossierKeys.detail(id), 'events'] as const,
  stats: () => [...dossierKeys.all, 'stats'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchDossier(id: string): Promise<Dossier> {
  const response = await fetch(`/api/dossiers/${id}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Dossier non trouvé' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    ...data,
    dateOuverture: data.dateOuverture ? new Date(data.dateOuverture) : undefined,
    dateCloture: data.dateCloture ? new Date(data.dateCloture) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    documents: data.documents?.map((doc: any) => ({
      ...doc,
      uploadedAt: new Date(doc.uploadedAt),
    })),
    events: data.events?.map((event: any) => ({
      ...event,
      date: new Date(event.date),
      createdAt: new Date(event.createdAt),
    })),
  }
}

async function fetchDossierList(params?: DossierListParams): Promise<DossierListResult> {
  const searchParams = new URLSearchParams()

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    })
  }

  const response = await fetch(`/api/dossiers?${searchParams.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    dossiers: data.dossiers.map((dossier: any) => ({
      ...dossier,
      dateOuverture: dossier.dateOuverture ? new Date(dossier.dateOuverture) : undefined,
      dateCloture: dossier.dateCloture ? new Date(dossier.dateCloture) : undefined,
      createdAt: new Date(dossier.createdAt),
      updatedAt: new Date(dossier.updatedAt),
    })),
    total: data.total,
    hasMore: data.hasMore,
  }
}

async function createDossier(params: CreateDossierParams): Promise<Dossier> {
  const response = await fetch('/api/dossiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de création' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    ...data,
    dateOuverture: data.dateOuverture ? new Date(data.dateOuverture) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function updateDossier(params: UpdateDossierParams): Promise<Dossier> {
  const { id, ...updates } = params

  const response = await fetch(`/api/dossiers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de mise à jour' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    ...data,
    dateOuverture: data.dateOuverture ? new Date(data.dateOuverture) : undefined,
    dateCloture: data.dateCloture ? new Date(data.dateCloture) : undefined,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function deleteDossier(id: string): Promise<void> {
  const response = await fetch(`/api/dossiers/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de suppression' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
}

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour charger un dossier par ID
 *
 * Usage :
 * ```tsx
 * const { data: dossier, isLoading } = useDossier('dossier-123')
 * ```
 */
export function useDossier(
  id: string,
  options?: {
    enabled?: boolean
    staleTime?: number
    cacheTime?: number
  }
) {
  const { enabled = true, staleTime = 5 * 60 * 1000, cacheTime = 30 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: dossierKeys.detail(id),
    queryFn: () => fetchDossier(id),
    enabled: enabled && !!id,
    staleTime,
    gcTime: cacheTime,
    // Background refresh pour données à jour (plus conservateur pour détails)
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

/**
 * Hook pour liste dossiers avec filtres
 *
 * Usage :
 * ```tsx
 * const { data, isLoading } = useDossierList({
 *   status: 'open',
 *   type: 'civil',
 *   sortBy: 'updatedAt',
 *   limit: 20,
 * })
 * ```
 */
export function useDossierList(params?: DossierListParams) {
  return useQuery({
    queryKey: dossierKeys.list(params),
    queryFn: () => fetchDossierList(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    // Background refresh pour données toujours à jour
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })
}

/**
 * Hook pour infinite scroll dossiers
 *
 * Usage :
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useDossierInfiniteList({ status: 'open', limit: 20 })
 * ```
 */
export function useDossierInfiniteList(params?: Omit<DossierListParams, 'offset'>) {
  return useInfiniteQuery({
    queryKey: dossierKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      fetchDossierList({
        ...params,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * (params?.limit || 20)
    },
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Hook pour créer un dossier
 *
 * Usage :
 * ```tsx
 * const { mutate: create, isPending } = useCreateDossier({
 *   onSuccess: (dossier) => router.push(`/dossiers/${dossier.id}`),
 * })
 *
 * const handleCreate = () => {
 *   create({
 *     clientId: 'client-123',
 *     titre: 'Nouveau dossier',
 *     type: 'civil',
 *     status: 'draft',
 *   })
 * }
 * ```
 */
export function useCreateDossier(options?: {
  onSuccess?: (dossier: Dossier) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createDossier,
    onSuccess: (dossier) => {
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: dossierKeys.lists() })
      // Ajouter au cache détail
      queryClient.setQueryData(dossierKeys.detail(dossier.id), dossier)
      options?.onSuccess?.(dossier)
    },
    onError: options?.onError,
  })
}

/**
 * Hook pour mettre à jour un dossier
 *
 * Usage :
 * ```tsx
 * const { mutate: update, isPending } = useUpdateDossier({
 *   onSuccess: () => toast({ title: 'Dossier mis à jour' }),
 * })
 *
 * const handleUpdate = () => {
 *   update({
 *     id: 'dossier-123',
 *     status: 'closed',
 *     dateCloture: new Date(),
 *   })
 * }
 * ```
 */
export function useUpdateDossier(options?: {
  onSuccess?: (dossier: Dossier) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateDossier,
    // Optimistic update
    onMutate: async (newData) => {
      // Annuler requêtes en cours pour éviter écrasement
      await queryClient.cancelQueries({ queryKey: dossierKeys.detail(newData.id) })

      // Sauvegarder données actuelles pour rollback
      const previousDossier = queryClient.getQueryData<Dossier>(dossierKeys.detail(newData.id))

      // Mettre à jour cache optimistiquement
      if (previousDossier) {
        queryClient.setQueryData(dossierKeys.detail(newData.id), {
          ...previousDossier,
          ...newData,
          updatedAt: new Date(),
        })
      }

      // Retourner context pour rollback si erreur
      return { previousDossier }
    },
    onError: (err, newData, context) => {
      // Rollback en cas d'erreur
      if (context?.previousDossier) {
        queryClient.setQueryData(dossierKeys.detail(newData.id), context.previousDossier)
      }
      options?.onError?.(err)
    },
    onSuccess: (dossier) => {
      // Mettre à jour cache détail avec données serveur
      queryClient.setQueryData(dossierKeys.detail(dossier.id), dossier)
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: dossierKeys.lists() })
      options?.onSuccess?.(dossier)
    },
    onSettled: (dossier) => {
      // Re-fetch pour garantir cohérence
      if (dossier) {
        queryClient.invalidateQueries({ queryKey: dossierKeys.detail(dossier.id) })
      }
    },
  })
}

/**
 * Hook pour supprimer un dossier
 */
export function useDeleteDossier(options?: {
  onSuccess?: () => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteDossier,
    // Optimistic delete
    onMutate: async (id) => {
      // Annuler requêtes en cours
      await queryClient.cancelQueries({ queryKey: dossierKeys.detail(id) })
      await queryClient.cancelQueries({ queryKey: dossierKeys.lists() })

      // Sauvegarder données actuelles pour rollback
      const previousDossier = queryClient.getQueryData<Dossier>(dossierKeys.detail(id))
      const previousLists = queryClient.getQueriesData({ queryKey: dossierKeys.lists() })

      // Retirer du cache optimistiquement
      queryClient.removeQueries({ queryKey: dossierKeys.detail(id) })

      // Retourner context pour rollback
      return { previousDossier, previousLists }
    },
    onError: (err, id, context) => {
      // Rollback en cas d'erreur
      if (context?.previousDossier) {
        queryClient.setQueryData(dossierKeys.detail(id), context.previousDossier)
      }
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      options?.onError?.(err)
    },
    onSuccess: (_, id) => {
      // Retirer du cache
      queryClient.removeQueries({ queryKey: dossierKeys.detail(id) })
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: dossierKeys.lists() })
      options?.onSuccess?.()
    },
    onSettled: () => {
      // Re-fetch listes pour garantir cohérence
      queryClient.invalidateQueries({ queryKey: dossierKeys.lists() })
    },
  })
}

/**
 * Hook pour préchargement dossier (hover)
 */
export function usePrefetchDossier() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: dossierKeys.detail(id),
      queryFn: () => fetchDossier(id),
      staleTime: 5 * 60 * 1000,
    })
  }
}

/**
 * Hook pour invalider cache dossiers
 */
export function useInvalidateDossiersCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: dossierKeys.all })
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached dossier without triggering fetch
 */
export function getCachedDossier(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
): Dossier | undefined {
  return queryClient.getQueryData(dossierKeys.detail(id))
}

/**
 * Set dossier in cache manually
 */
export function setCachedDossier(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  data: Dossier
): void {
  queryClient.setQueryData(dossierKeys.detail(id), data)
}

/**
 * Filtre local dossiers (optimiste, sans API)
 */
export function useFilteredDossiers(
  dossiers: Dossier[] | undefined,
  filters: {
    type?: DossierType
    status?: DossierStatus
    priority?: 'low' | 'medium' | 'high' | 'urgent'
    search?: string
  }
): Dossier[] {
  if (!dossiers) return []

  return dossiers.filter((dossier) => {
    if (filters.type && dossier.type !== filters.type) return false
    if (filters.status && dossier.status !== filters.status) return false
    if (filters.priority && dossier.priority !== filters.priority) return false
    if (
      filters.search &&
      !dossier.titre.toLowerCase().includes(filters.search.toLowerCase()) &&
      !dossier.description?.toLowerCase().includes(filters.search.toLowerCase())
    ) {
      return false
    }

    return true
  })
}
