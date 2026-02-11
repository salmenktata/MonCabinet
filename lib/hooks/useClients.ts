/**
 * Hook React Query pour Gestion Clients
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Gestion cache clients avec CRUD complet.
 * Gain attendu : -50% requêtes API, navigation instantanée
 */

'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'

// =============================================================================
// TYPES
// =============================================================================

export interface Client {
  id: string
  userId: string
  type: 'particulier' | 'entreprise'
  typeClient?: string // Alias pour compatibilité API snake_case
  nom: string
  prenom?: string
  raisonSociale?: string
  email?: string
  telephone?: string
  telephoneSecondaire?: string
  adresse?: string
  codePostal?: string
  ville?: string
  pays?: string
  notes?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
  dossiers?: any[] // Liste dossiers associés (GET /api/clients/[id])
}

export interface ClientListParams {
  type?: 'particulier' | 'entreprise'
  search?: string
  sortBy?: 'createdAt' | 'updatedAt' | 'nom'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface ClientListResult {
  clients: Client[]
  total: number
  hasMore: boolean
}

export interface CreateClientParams {
  type: 'particulier' | 'entreprise'
  nom: string
  prenom?: string
  raisonSociale?: string
  email?: string
  telephone?: string
  telephoneSecondaire?: string
  adresse?: string
  codePostal?: string
  ville?: string
  pays?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface UpdateClientParams extends Partial<CreateClientParams> {
  id: string
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (params?: ClientListParams) => [...clientKeys.lists(), params] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  stats: () => [...clientKeys.all, 'stats'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchClient(id: string): Promise<Client> {
  const response = await fetch(`/api/clients/${id}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Client non trouvé' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function fetchClientList(params?: ClientListParams): Promise<ClientListResult> {
  const searchParams = new URLSearchParams()

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    })
  }

  const response = await fetch(`/api/clients?${searchParams.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  return {
    clients: data.clients.map((client: any) => ({
      ...client,
      createdAt: new Date(client.createdAt),
      updatedAt: new Date(client.updatedAt),
    })),
    total: data.total,
    hasMore: data.hasMore,
  }
}

async function createClient(params: CreateClientParams): Promise<Client> {
  const response = await fetch('/api/clients', {
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
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function updateClient(params: UpdateClientParams): Promise<Client> {
  const { id, ...updates } = params

  const response = await fetch(`/api/clients/${id}`, {
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
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

async function deleteClient(id: string): Promise<void> {
  const response = await fetch(`/api/clients/${id}`, {
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
 * Hook pour charger un client par ID
 *
 * Usage :
 * ```tsx
 * const { data: client, isLoading } = useClient('client-123')
 * ```
 */
export function useClient(
  id: string,
  options?: {
    enabled?: boolean
    staleTime?: number
    cacheTime?: number
  }
) {
  const { enabled = true, staleTime = 5 * 60 * 1000, cacheTime = 30 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: () => fetchClient(id),
    enabled: enabled && !!id,
    staleTime,
    gcTime: cacheTime,
  })
}

/**
 * Hook pour liste clients avec filtres
 *
 * Usage :
 * ```tsx
 * const { data, isLoading } = useClientList({
 *   type: 'particulier',
 *   search: 'dupont',
 *   sortBy: 'nom',
 *   limit: 20,
 * })
 * ```
 */
export function useClientList(params?: ClientListParams) {
  return useQuery({
    queryKey: clientKeys.list(params),
    queryFn: () => fetchClientList(params),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Hook pour infinite scroll clients
 *
 * Usage :
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useClientInfiniteList({ type: 'entreprise', limit: 20 })
 * ```
 */
export function useClientInfiniteList(params?: Omit<ClientListParams, 'offset'>) {
  return useInfiniteQuery({
    queryKey: clientKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      fetchClientList({
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
 * Hook pour créer un client
 *
 * Usage :
 * ```tsx
 * const { mutate: create, isPending } = useCreateClient({
 *   onSuccess: (client) => router.push(`/clients/${client.id}`),
 * })
 *
 * const handleCreate = () => {
 *   create({
 *     type: 'particulier',
 *     nom: 'Dupont',
 *     prenom: 'Jean',
 *     email: 'jean.dupont@example.com',
 *   })
 * }
 * ```
 */
export function useCreateClient(options?: {
  onSuccess?: (client: Client) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createClient,
    onSuccess: (client) => {
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() })
      // Ajouter au cache détail
      queryClient.setQueryData(clientKeys.detail(client.id), client)
      options?.onSuccess?.(client)
    },
    onError: options?.onError,
  })
}

/**
 * Hook pour mettre à jour un client
 *
 * Usage :
 * ```tsx
 * const { mutate: update, isPending } = useUpdateClient({
 *   onSuccess: () => toast({ title: 'Client mis à jour' }),
 * })
 *
 * const handleUpdate = () => {
 *   update({
 *     id: 'client-123',
 *     telephone: '0612345678',
 *   })
 * }
 * ```
 */
export function useUpdateClient(options?: {
  onSuccess?: (client: Client) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateClient,
    onSuccess: (client) => {
      // Mettre à jour cache détail
      queryClient.setQueryData(clientKeys.detail(client.id), client)
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() })
      options?.onSuccess?.(client)
    },
    onError: options?.onError,
  })
}

/**
 * Hook pour supprimer un client
 */
export function useDeleteClient(options?: {
  onSuccess?: () => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteClient,
    onSuccess: (_, id) => {
      // Retirer du cache
      queryClient.removeQueries({ queryKey: clientKeys.detail(id) })
      // Invalider listes
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() })
      options?.onSuccess?.()
    },
    onError: options?.onError,
  })
}

/**
 * Hook pour préchargement client (hover)
 */
export function usePrefetchClient() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: clientKeys.detail(id),
      queryFn: () => fetchClient(id),
      staleTime: 5 * 60 * 1000,
    })
  }
}

/**
 * Hook pour invalider cache clients
 */
export function useInvalidateClientsCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: clientKeys.all })
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached client without triggering fetch
 */
export function getCachedClient(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
): Client | undefined {
  return queryClient.getQueryData(clientKeys.detail(id))
}

/**
 * Set client in cache manually
 */
export function setCachedClient(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  data: Client
): void {
  queryClient.setQueryData(clientKeys.detail(id), data)
}

/**
 * Filtre local clients (optimiste, sans API)
 */
export function useFilteredClients(
  clients: Client[] | undefined,
  filters: {
    type?: 'particulier' | 'entreprise'
    search?: string
  }
): Client[] {
  if (!clients) return []

  return clients.filter((client) => {
    if (filters.type && client.type !== filters.type) return false

    if (filters.search) {
      const search = filters.search.toLowerCase()
      const matchNom = client.nom.toLowerCase().includes(search)
      const matchPrenom = client.prenom?.toLowerCase().includes(search)
      const matchEmail = client.email?.toLowerCase().includes(search)
      const matchRaison = client.raisonSociale?.toLowerCase().includes(search)

      if (!matchNom && !matchPrenom && !matchEmail && !matchRaison) {
        return false
      }
    }

    return true
  })
}
