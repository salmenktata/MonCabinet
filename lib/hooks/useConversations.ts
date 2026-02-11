/**
 * Hook React Query pour Conversations Chat IA
 *
 * Sprint 6 - Phase 3 : Cache & Performance
 *
 * Gestion cache conversations, messages, historique chat.
 * Gain attendu : -70% requêtes API, UX instantanée navigation historique
 */

'use client'

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'

// =============================================================================
// TYPES
// =============================================================================

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    sources?: Array<{
      id: string
      title: string
      category: string
      similarity: number
    }>
    processingTimeMs?: number
    confiance?: number
    usedPremiumModel?: boolean
  }
}

export interface Conversation {
  id: string
  userId?: string // Optionnel car pas toujours retourné par l'API
  title: string
  dossierId?: string // ID du dossier lié (optionnel)
  dossierNumero?: string // Numéro du dossier (optionnel)
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  metadata?: {
    category?: string
    domain?: string
    language?: 'fr' | 'ar'
    totalMessages?: number
    averageConfidence?: number
  }
}

export interface ConversationListParams {
  limit?: number
  offset?: number
  sortBy?: 'createdAt' | 'updatedAt' | 'title'
  sortOrder?: 'asc' | 'desc'
  category?: string
  language?: 'fr' | 'ar'
}

export interface ConversationListResult {
  conversations: Conversation[]
  total: number
  hasMore: boolean
}

export interface SendMessageParams {
  conversationId?: string
  message: string
  usePremiumModel?: boolean
  maxDepth?: number
}

// =============================================================================
// QUERY KEYS
// =============================================================================

export const conversationKeys = {
  all: ['conversations'] as const,
  lists: () => [...conversationKeys.all, 'list'] as const,
  list: (params?: ConversationListParams) => [...conversationKeys.lists(), params] as const,
  details: () => [...conversationKeys.all, 'detail'] as const,
  detail: (id: string) => [...conversationKeys.details(), id] as const,
  messages: (id: string) => [...conversationKeys.detail(id), 'messages'] as const,
  recent: () => [...conversationKeys.all, 'recent'] as const,
  stats: () => [...conversationKeys.all, 'stats'] as const,
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function fetchConversation(id: string): Promise<Conversation> {
  const response = await fetch(`/api/chat?conversationId=${id}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Conversation non trouvée' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // L'API /api/chat retourne { conversation, messages }
  return {
    id: data.conversation.id,
    title: data.conversation.title,
    dossierId: data.conversation.dossier_id,
    dossierNumero: data.conversation.dossier_numero,
    messages: data.messages.map((msg: any) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      sources: msg.sources,
      tokensUsed: msg.tokensUsed,
      timestamp: new Date(msg.createdAt),
    })),
    createdAt: new Date(data.conversation.created_at),
    updatedAt: new Date(data.conversation.created_at), // Pas de updated_at dans l'API
  }
}

async function fetchConversationList(
  params?: ConversationListParams
): Promise<ConversationListResult> {
  const searchParams = new URLSearchParams()

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value))
      }
    })
  }

  const response = await fetch(`/api/chat?${searchParams.toString()}`)

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de chargement' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // L'API /api/chat retourne { conversations: [...] }
  // Note: L'API actuelle ne supporte pas pagination (total, hasMore)
  // Elle retourne toujours les 30 dernières conversations
  return {
    conversations: (data.conversations || []).map((conv: any) => ({
      id: conv.id,
      title: conv.title,
      dossierId: conv.dossier_id,
      dossierNumero: conv.dossier_numero,
      messages: [], // Pas de messages dans la liste
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at || conv.created_at),
    })),
    total: data.conversations?.length || 0,
    hasMore: false, // L'API actuelle ne supporte pas la pagination
  }
}

async function sendMessage(params: SendMessageParams): Promise<{
  conversation: Conversation
  message: Message
}> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: params.message, // L'API attend 'question', pas 'message'
      conversationId: params.conversationId,
      usePremiumModel: params.usePremiumModel || false,
      includeJurisprudence: true, // Toujours inclure les sources juridiques
      stream: false, // Mode non-streaming (pour simplifier)
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur d\'envoi' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  const data = await response.json()

  // L'API /api/chat retourne { answer, sources, conversationId, tokensUsed }
  // Construire un objet minimaliste pour le retour
  // Le hook useSendMessage() va ensuite refetch la conversation complète
  return {
    conversation: {
      id: data.conversationId,
      userId: '', // Non disponible dans la réponse
      title: '', // Non disponible dans la réponse
      messages: [], // Sera refetch automatiquement
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    message: {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: data.answer,
      timestamp: new Date(),
      metadata: {
        sources: data.sources,
        processingTimeMs: data.tokensUsed?.total || 0,
        usedPremiumModel: params.usePremiumModel,
      },
    },
  }
}

async function deleteConversation(id: string): Promise<void> {
  const response = await fetch(`/api/chat?conversationId=${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erreur de suppression' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }
}

/**
 * TODO: Créer endpoint PATCH /api/chat pour update titre conversation
 *
 * L'API /api/chat actuelle ne supporte pas PATCH.
 * Pour l'instant, la fonction et le hook sont désactivés.
 *
 * Endpoint à créer:
 * PATCH /api/chat?conversationId=xxx
 * Body: { title: string }
 * Response: { success: true }
 */
// async function updateConversationTitle(id: string, title: string): Promise<Conversation> {
//   const response = await fetch(`/api/chat?conversationId=${id}`, {
//     method: 'PATCH',
//     headers: {
//       'Content-Type': 'application/json',
//     },
//     body: JSON.stringify({ title }),
//   })
//
//   if (!response.ok) {
//     const error = await response.json().catch(() => ({ error: 'Erreur de mise à jour' }))
//     throw new Error(error.error || `HTTP ${response.status}`)
//   }
//
//   const data = await response.json()
//
//   return {
//     id: data.id,
//     userId: data.userId,
//     title: data.title,
//     messages: [],
//     createdAt: new Date(data.createdAt),
//     updatedAt: new Date(data.updatedAt),
//   }
// }

// =============================================================================
// HOOKS
// =============================================================================

/**
 * Hook pour charger une conversation par ID
 *
 * Usage :
 * ```tsx
 * const { data: conversation, isLoading } = useConversation('conv-123')
 *
 * // Accès aux messages
 * conversation?.messages.map(msg => <MessageCard {...msg} />)
 * ```
 */
export function useConversation(
  id: string,
  options?: {
    enabled?: boolean
    staleTime?: number
    cacheTime?: number
  }
) {
  const { enabled = true, staleTime = 2 * 60 * 1000, cacheTime = 30 * 60 * 1000 } = options || {}

  return useQuery({
    queryKey: conversationKeys.detail(id),
    queryFn: () => fetchConversation(id),
    enabled: enabled && !!id,
    staleTime,
    gcTime: cacheTime,
  })
}

/**
 * Hook pour liste conversations avec filtres
 *
 * Usage :
 * ```tsx
 * const { data, isLoading } = useConversationList({
 *   category: 'jurisprudence',
 *   sortBy: 'updatedAt',
 *   limit: 20,
 * })
 * ```
 */
export function useConversationList(params?: ConversationListParams) {
  return useQuery({
    queryKey: conversationKeys.list(params),
    queryFn: () => fetchConversationList(params),
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

/**
 * Hook pour infinite scroll conversations (sidebar historique)
 *
 * Usage :
 * ```tsx
 * const {
 *   data,
 *   fetchNextPage,
 *   hasNextPage,
 *   isFetchingNextPage,
 * } = useConversationInfiniteList({ limit: 20 })
 *
 * <InfiniteScroll loadMore={fetchNextPage} hasMore={hasNextPage}>
 *   {data?.pages.flatMap(page => page.conversations).map(conv =>
 *     <ConversationCard key={conv.id} {...conv} />
 *   )}
 * </InfiniteScroll>
 * ```
 */
export function useConversationInfiniteList(
  params?: Omit<ConversationListParams, 'offset'>
) {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(params),
    queryFn: ({ pageParam = 0 }) =>
      fetchConversationList({
        ...params,
        offset: pageParam,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined
      return allPages.length * (params?.limit || 20)
    },
    staleTime: 1 * 60 * 1000,
  })
}

/**
 * Hook pour envoi message avec optimistic update
 *
 * Usage :
 * ```tsx
 * const { mutate: send, isPending } = useSendMessage({
 *   onSuccess: (data) => {
 *     console.log('Message envoyé:', data.message.content)
 *   },
 * })
 *
 * const handleSubmit = () => {
 *   send({
 *     conversationId: 'conv-123',
 *     message: 'Quelle est la prescription civile ?',
 *     usePremiumModel: false,
 *   })
 * }
 * ```
 */
export function useSendMessage(options?: {
  onSuccess?: (data: { conversation: Conversation; message: Message }) => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendMessage,
    onMutate: async (params) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({
        queryKey: params.conversationId
          ? conversationKeys.detail(params.conversationId)
          : conversationKeys.lists(),
      })

      // Snapshot previous value
      const previousConversation = params.conversationId
        ? queryClient.getQueryData<Conversation>(
            conversationKeys.detail(params.conversationId)
          )
        : undefined

      // Optimistically update conversation
      if (params.conversationId && previousConversation) {
        const optimisticMessage: Message = {
          id: `temp-${Date.now()}`,
          role: 'user',
          content: params.message,
          timestamp: new Date(),
        }

        queryClient.setQueryData<Conversation>(
          conversationKeys.detail(params.conversationId),
          {
            ...previousConversation,
            messages: [...previousConversation.messages, optimisticMessage],
          }
        )
      }

      return { previousConversation }
    },
    onSuccess: (data, variables) => {
      // Update conversation cache
      queryClient.setQueryData(
        conversationKeys.detail(data.conversation.id),
        data.conversation
      )

      // Invalidate lists to show new/updated conversation
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })

      options?.onSuccess?.(data)
    },
    onError: (error, variables, context) => {
      // Rollback optimistic update
      if (variables.conversationId && context?.previousConversation) {
        queryClient.setQueryData(
          conversationKeys.detail(variables.conversationId),
          context.previousConversation
        )
      }

      options?.onError?.(error)
    },
  })
}

/**
 * Hook pour suppression conversation
 */
export function useDeleteConversation(options?: {
  onSuccess?: () => void
  onError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteConversation,
    onSuccess: (_, id) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: conversationKeys.detail(id) })
      // Invalidate lists
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
      options?.onSuccess?.()
    },
    onError: options?.onError,
  })
}

/**
 * Hook pour update titre conversation
 *
 * @deprecated Désactivé temporairement - endpoint PATCH manquant dans /api/chat
 * TODO: Créer endpoint PATCH /api/chat?conversationId=xxx puis réactiver
 */
// export function useUpdateConversationTitle(options?: {
//   onSuccess?: (data: Conversation) => void
//   onError?: (error: Error) => void
// }) {
//   const queryClient = useQueryClient()
//
//   return useMutation({
//     mutationFn: ({ id, title }: { id: string; title: string }) =>
//       updateConversationTitle(id, title),
//     onSuccess: (data) => {
//       // Update cache
//       queryClient.setQueryData(conversationKeys.detail(data.id), data)
//       // Invalidate lists
//       queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
//       options?.onSuccess?.(data)
//     },
//     onError: options?.onError,
//   })
// }

/**
 * Hook pour préchargement conversation (hover sidebar)
 */
export function usePrefetchConversation() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: conversationKeys.detail(id),
      queryFn: () => fetchConversation(id),
      staleTime: 2 * 60 * 1000,
    })
  }
}

/**
 * Hook pour invalider cache conversations (logout, etc.)
 */
export function useInvalidateConversationsCache() {
  const queryClient = useQueryClient()

  return () => {
    queryClient.invalidateQueries({ queryKey: conversationKeys.all })
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get cached conversation without triggering fetch
 */
export function getCachedConversation(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string
): Conversation | undefined {
  return queryClient.getQueryData(conversationKeys.detail(id))
}

/**
 * Set conversation in cache manually
 */
export function setCachedConversation(
  queryClient: ReturnType<typeof useQueryClient>,
  id: string,
  data: Conversation
): void {
  queryClient.setQueryData(conversationKeys.detail(id), data)
}

/**
 * Extract last N messages from conversation
 */
export function getLastMessages(conversation: Conversation, count: number): Message[] {
  return conversation.messages.slice(-count)
}

/**
 * Calculate average confidence from messages
 */
export function calculateAverageConfidence(messages: Message[]): number {
  const withConfidence = messages.filter((msg) => msg.metadata?.confiance !== undefined)
  if (withConfidence.length === 0) return 0

  const sum = withConfidence.reduce((acc, msg) => acc + (msg.metadata?.confiance || 0), 0)
  return sum / withConfidence.length
}
