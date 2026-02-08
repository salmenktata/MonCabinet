'use client'

import { useRef, useMemo, useCallback, useState, useEffect } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

interface VirtualizedItem {
  index: number
  start: number
  size: number
  message: Message
}

interface UseVirtualizedMessagesOptions {
  estimatedItemSize?: number
  overscan?: number
  threshold?: number // Nombre de messages avant d'activer la virtualisation
}

interface UseVirtualizedMessagesResult {
  virtualItems: VirtualizedItem[]
  totalSize: number
  containerRef: React.RefObject<HTMLDivElement>
  isVirtualized: boolean
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void
  scrollToBottom: () => void
}

/**
 * Hook simplifié pour la virtualisation des messages
 * Fallback gracieux si @tanstack/react-virtual n'est pas installé
 */
export function useVirtualizedMessages(
  messages: Message[],
  options: UseVirtualizedMessagesOptions = {}
): UseVirtualizedMessagesResult {
  const {
    estimatedItemSize = 100,
    overscan = 5,
    threshold = 50,
  } = options

  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  // Déterminer si la virtualisation est nécessaire
  const isVirtualized = messages.length > threshold

  // Observer le scroll du conteneur
  useEffect(() => {
    const container = containerRef.current
    if (!container || !isVirtualized) return

    const handleScroll = () => {
      setScrollTop(container.scrollTop)
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    container.addEventListener('scroll', handleScroll)
    resizeObserver.observe(container)

    // Initial values
    setScrollTop(container.scrollTop)
    setContainerHeight(container.clientHeight)

    return () => {
      container.removeEventListener('scroll', handleScroll)
      resizeObserver.disconnect()
    }
  }, [isVirtualized])

  // Calculer les items virtuels
  const virtualItems = useMemo(() => {
    if (!isVirtualized) {
      // Sans virtualisation, retourner tous les messages
      return messages.map((message, index) => ({
        index,
        start: index * estimatedItemSize,
        size: estimatedItemSize,
        message,
      }))
    }

    // Calcul des items visibles avec overscan
    const totalSize = messages.length * estimatedItemSize
    const startIndex = Math.max(0, Math.floor(scrollTop / estimatedItemSize) - overscan)
    const endIndex = Math.min(
      messages.length - 1,
      Math.ceil((scrollTop + containerHeight) / estimatedItemSize) + overscan
    )

    const items: VirtualizedItem[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      items.push({
        index: i,
        start: i * estimatedItemSize,
        size: estimatedItemSize,
        message: messages[i],
      })
    }

    return items
  }, [messages, isVirtualized, scrollTop, containerHeight, estimatedItemSize, overscan])

  // Taille totale de la liste
  const totalSize = useMemo(() => {
    return messages.length * estimatedItemSize
  }, [messages.length, estimatedItemSize])

  // Scroll vers un index spécifique
  const scrollToIndex = useCallback(
    (index: number, options: { align?: 'start' | 'center' | 'end' } = {}) => {
      const container = containerRef.current
      if (!container) return

      const { align = 'start' } = options
      let targetScroll = index * estimatedItemSize

      if (align === 'center') {
        targetScroll -= containerHeight / 2 - estimatedItemSize / 2
      } else if (align === 'end') {
        targetScroll -= containerHeight - estimatedItemSize
      }

      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth',
      })
    },
    [estimatedItemSize, containerHeight]
  )

  // Scroll vers le bas
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth',
    })
  }, [])

  return {
    virtualItems,
    totalSize,
    containerRef,
    isVirtualized,
    scrollToIndex,
    scrollToBottom,
  }
}

/**
 * Composant wrapper pour les messages virtualisés
 * À utiliser avec les styles appropriés
 */
export function VirtualizedMessagesContainer({
  children,
  totalSize,
  containerRef,
}: {
  children: React.ReactNode
  totalSize: number
  containerRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: totalSize,
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * Composant wrapper pour un item virtualisé
 */
export function VirtualizedMessageItem({
  children,
  start,
  size,
}: {
  children: React.ReactNode
  start: number
  size: number
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        transform: `translateY(${start}px)`,
        minHeight: size,
      }}
    >
      {children}
    </div>
  )
}
