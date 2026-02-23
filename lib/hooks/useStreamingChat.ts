'use client'

import { useState, useCallback, useRef } from 'react'
import type { AbrogationAlert } from '@/types/abrogation-alerts' // Phase 3.4

export interface StreamingMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: any[]
  tokensUsed?: number
  isStreaming?: boolean
  abrogationAlerts?: AbrogationAlert[] // Phase 3.4
}

export interface ChatSource {
  id: string
  title: string
  content: string
  similarity: number
  boostedSimilarity?: number
  type: string
}

interface StreamMetadata {
  conversationId: string
  sources: ChatSource[]
  model: string
}

interface StreamChunk {
  type: 'metadata' | 'content' | 'done' | 'error'
  content?: string
  conversationId?: string
  sources?: ChatSource[]
  model?: string
  tokensUsed?: { input: number; output: number; total: number }
  error?: string
  abrogationAlerts?: AbrogationAlert[] // Phase 3.4
}

interface UseStreamingChatOptions {
  onError?: (error: Error) => void
  onComplete?: (message: StreamingMessage, metadata?: StreamMetadata) => void
}

export function useStreamingChat(options: UseStreamingChatOptions = {}) {
  const [messages, setMessages] = useState<StreamingMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [currentMetadata, setCurrentMetadata] = useState<StreamMetadata | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (
      question: string,
      conversationId?: string,
      dossierId?: string,
      stream: boolean = true,
      extraBody?: Record<string, unknown>
    ) => {
      // Ajouter le message utilisateur immédiatement
      const userMessage: StreamingMessage = {
        role: 'user',
        content: question,
      }
      setMessages((prev) => [...prev, userMessage])

      // Réinitialiser l'état
      setStreamingContent('')
      setCurrentMetadata(null)
      setIsStreaming(true)

      // Créer un AbortController pour pouvoir annuler la requête
      abortControllerRef.current = new AbortController()

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question,
            conversationId,
            dossierId,
            stream,
            includeJurisprudence: true,
            ...extraBody,
          }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Erreur réseau')
        }

        // Choisir mode streaming ou JSON selon Content-Type réel de la réponse
        const isSSE = response.headers.get('Content-Type')?.includes('text/event-stream')
        if (isSSE && response.body) {
          // Mode streaming SSE réel
          await handleStreamResponse(response.body)
        } else {
          // Mode non-streaming (structure/consult ou fallback)
          const data = await response.json()
          const assistantMessage: StreamingMessage = {
            role: 'assistant',
            content: data.answer,
            sources: data.sources,
            tokensUsed: data.tokensUsed?.total,
            abrogationAlerts: data.abrogationAlerts, // Phase 3.4
          }
          // Créer metadata à partir du JSON pour que onComplete ait le conversationId
          const jsonMetadata: StreamMetadata | undefined = data.conversationId
            ? { conversationId: data.conversationId, sources: data.sources || [], model: data.model || '' }
            : undefined
          setMessages((prev) => [...prev, assistantMessage])
          options.onComplete?.(assistantMessage, jsonMetadata)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Requête annulée')
        } else {
          console.error('Erreur lors de l\'envoi du message:', error)
          options.onError?.(error as Error)
        }
      } finally {
        setIsStreaming(false)
        setStreamingContent('')
        abortControllerRef.current = null
      }
    },
    [options]
  )

  const handleStreamResponse = async (body: ReadableStream<Uint8Array>) => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullContent = ''
    let metadata: StreamMetadata | null = null

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        // Décoder le chunk
        buffer += decoder.decode(value, { stream: true })

        // Parser les événements SSE (format: data: {...}\n\n)
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // Garder la dernière ligne incomplète

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue

          try {
            const jsonStr = line.replace(/^data: /, '')
            const chunk: StreamChunk = JSON.parse(jsonStr)

            switch (chunk.type) {
              case 'metadata':
                // Stocker les métadonnées
                metadata = {
                  conversationId: chunk.conversationId!,
                  sources: chunk.sources || [],
                  model: chunk.model || '',
                }
                setCurrentMetadata(metadata)
                break

              case 'content':
                // Ajouter le contenu progressivement
                fullContent += chunk.content || ''
                setStreamingContent(fullContent)
                break

              case 'done': {
                // Streaming terminé
                const finalMessage: StreamingMessage = {
                  role: 'assistant',
                  content: fullContent,
                  sources: metadata?.sources,
                  tokensUsed: chunk.tokensUsed?.total,
                }
                setMessages((prev) => [...prev, finalMessage])
                options.onComplete?.(finalMessage, metadata || undefined)
                break
              }

              case 'error':
                throw new Error(chunk.error || 'Erreur streaming')
            }
          } catch (parseError) {
            console.error('Erreur parsing chunk:', parseError)
          }
        }
      }
    } catch (error) {
      console.error('Erreur lecture stream:', error)
      throw error
    }
  }

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
    setStreamingContent('')
    setCurrentMetadata(null)
  }, [])

  return {
    messages,
    isStreaming,
    streamingContent,
    currentMetadata,
    sendMessage,
    stopStreaming,
    clearMessages,
  }
}
