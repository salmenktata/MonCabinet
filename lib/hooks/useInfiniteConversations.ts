'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface Conversation {
  id: string
  titre: string
  updated_at: string
  preview?: string
}

interface UseInfiniteConversationsOptions {
  pageSize?: number
  initialData?: Conversation[]
}

interface UseInfiniteConversationsResult {
  conversations: Conversation[]
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: Error | null
  loadMore: () => Promise<void>
  refresh: () => Promise<void>
  totalCount: number
}

/**
 * Hook pour charger les conversations avec pagination infinie
 * Utilise cursor-based pagination pour de meilleures performances
 */
export function useInfiniteConversations(
  options: UseInfiniteConversationsOptions = {}
): UseInfiniteConversationsResult {
  const { pageSize = 20, initialData = [] } = options

  const [conversations, setConversations] = useState<Conversation[]>(initialData)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [totalCount, setTotalCount] = useState(0)

  // Cursor pour la pagination (ID de la dernière conversation chargée)
  const cursorRef = useRef<string | null>(null)

  // Fetch conversations
  const fetchConversations = useCallback(
    async (cursor?: string | null, append: boolean = false) => {
      try {
        const params = new URLSearchParams({
          limit: pageSize.toString(),
          ...(cursor ? { cursor } : {}),
        })

        const response = await fetch(`/api/chat/conversations?${params}`)

        if (!response.ok) {
          throw new Error('Erreur lors du chargement des conversations')
        }

        const data = await response.json()

        const newConversations: Conversation[] = data.conversations || []
        const nextCursor: string | null = data.nextCursor || null
        const total: number = data.total || 0

        setTotalCount(total)
        setHasMore(!!nextCursor)
        cursorRef.current = nextCursor

        if (append) {
          setConversations((prev) => [...prev, ...newConversations])
        } else {
          setConversations(newConversations)
        }

        return newConversations
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Erreur inconnue')
        setError(error)
        throw error
      }
    },
    [pageSize]
  )

  // Charger les données initiales
  useEffect(() => {
    if (initialData.length === 0) {
      setIsLoading(true)
      fetchConversations()
        .catch(console.error)
        .finally(() => setIsLoading(false))
    }
  }, [fetchConversations, initialData.length])

  // Charger plus de conversations
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return

    setIsLoadingMore(true)
    try {
      await fetchConversations(cursorRef.current, true)
    } finally {
      setIsLoadingMore(false)
    }
  }, [fetchConversations, hasMore, isLoadingMore])

  // Rafraîchir les conversations
  const refresh = useCallback(async () => {
    setIsLoading(true)
    cursorRef.current = null
    try {
      await fetchConversations(null, false)
    } finally {
      setIsLoading(false)
    }
  }, [fetchConversations])

  return {
    conversations,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
    totalCount,
  }
}

/**
 * Hook pour détecter le scroll vers le bas (infinite scroll trigger)
 */
export function useInfiniteScroll(
  containerRef: React.RefObject<HTMLElement>,
  onLoadMore: () => void,
  options: { threshold?: number; enabled?: boolean } = {}
) {
  const { threshold = 200, enabled = true } = options

  useEffect(() => {
    if (!enabled) return

    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight

      if (distanceFromBottom < threshold) {
        onLoadMore()
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [containerRef, onLoadMore, threshold, enabled])
}
