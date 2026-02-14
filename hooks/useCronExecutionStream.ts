/**
 * Hook React pour écouter les événements temps réel des exécutions de crons
 * Utilise Server-Sent Events (SSE)
 */

import { useEffect, useState, useRef } from 'react'

export interface CronExecutionEvent {
  type: 'started' | 'completed' | 'failed'
  executionId: string
  cronName: string
  status: string
  durationMs?: number
  errorMessage?: string | null
  timestamp: string
}

interface UseCronExecutionStreamOptions {
  onEvent?: (event: CronExecutionEvent) => void
  onError?: (error: Error) => void
  enabled?: boolean
}

export function useCronExecutionStream(options: UseCronExecutionStreamOptions = {}) {
  const { onEvent, onError, enabled = true } = options
  const [isConnected, setIsConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<CronExecutionEvent | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!enabled) {
      return
    }

    let isMounted = true

    const connect = () => {
      try {
        // Créer EventSource pour SSE
        const eventSource = new EventSource('/api/admin/cron-executions/stream')
        eventSourceRef.current = eventSource

        eventSource.onopen = () => {
          if (isMounted) {
            setIsConnected(true)
            console.log('[SSE] Connected to cron execution stream')
          }
        }

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data) as CronExecutionEvent

            // Ignorer événement de connexion système
            if (data.cronName === 'system' && data.executionId === 'connection') {
              return
            }

            if (isMounted) {
              setLastEvent(data)
              onEvent?.(data)
            }
          } catch (error) {
            console.error('[SSE] Error parsing event:', error)
          }
        }

        eventSource.onerror = (error) => {
          console.error('[SSE] Connection error:', error)
          setIsConnected(false)
          eventSource.close()

          // Reconnect automatiquement après 5s
          if (isMounted) {
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log('[SSE] Reconnecting...')
              connect()
            }, 5000)
          }

          onError?.(new Error('SSE connection error'))
        }
      } catch (error) {
        console.error('[SSE] Failed to create EventSource:', error)
        onError?.(error as Error)
      }
    }

    // Démarrer connexion
    connect()

    // Cleanup
    return () => {
      isMounted = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [enabled, onEvent, onError])

  return {
    isConnected,
    lastEvent,
  }
}
