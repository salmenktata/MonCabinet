'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { MarkdownMessage } from './MarkdownMessage'
import { SourcesPanel } from './SourcesPanel'

export interface ChatSource {
  documentId: string
  documentName: string
  chunkContent: string
  similarity: number
  metadata?: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  createdAt: Date
  isStreaming?: boolean
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading?: boolean
  streamingContent?: string
}

export function ChatMessages({ messages, isLoading, streamingContent }: ChatMessagesProps) {
  const t = useTranslations('assistantIA')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll vers le bas
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  if (messages.length === 0 && !isLoading && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Icons.messageSquare className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{t('welcomeTitle')}</h3>
          <p className="text-muted-foreground text-sm">{t('welcomeMessage')}</p>
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t('exampleQuestions')}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['civil', 'commercial', 'divorce'].map((type) => (
                <Badge key={type} variant="outline" className="cursor-default">
                  {t(`examples.${type}`)}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Message en cours de streaming */}
      {streamingContent && (
        <MessageBubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            createdAt: new Date(),
            isStreaming: true,
          }}
        />
      )}

      {/* Indicateur de chargement */}
      {isLoading && !streamingContent && (
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Icons.zap className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const t = useTranslations('assistantIA')
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
          isUser ? 'bg-primary' : 'bg-primary/10'
        )}
      >
        {isUser ? (
          <Icons.user className="h-4 w-4 text-primary-foreground" />
        ) : (
          <Icons.zap className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Contenu */}
      <div className={cn('flex-1 max-w-[85%]', isUser && 'flex flex-col items-end')}>
        <div
          className={cn(
            'rounded-2xl px-4 py-3 text-sm',
            isUser
              ? 'bg-primary text-primary-foreground rounded-tr-sm'
              : 'bg-muted rounded-tl-sm'
          )}
        >
          {isUser ? (
            // Message utilisateur : simple texte
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          ) : (
            // Message assistant : rendu Markdown avec citations
            <>
              <MarkdownMessage
                content={message.content}
                sources={message.sources}
              />
              {message.isStreaming && (
                <span className="inline-block w-0.5 h-4 ml-1 bg-current animate-blink" />
              )}
            </>
          )}

          {/* Indicateur "typing..." pour le streaming */}
          {message.isStreaming && !message.content && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>

        {/* Panneau Sources enrichi */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <SourcesPanel sources={message.sources} />
        )}

        {/* Timestamp */}
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  )
}

