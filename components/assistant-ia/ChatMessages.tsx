'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

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
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
            )}
          </div>
        </div>

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.sources.slice(0, 3).map((source, idx) => (
              <SourceBadge key={idx} source={source} />
            ))}
            {message.sources.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{message.sources.length - 3}
              </Badge>
            )}
          </div>
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

function SourceBadge({ source }: { source: ChatSource }) {
  const t = useTranslations('assistantIA')
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative">
      <Badge
        variant="secondary"
        className="text-xs cursor-help max-w-[200px] truncate"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Icons.fileText className="h-3 w-3 mr-1" />
        {source.documentName}
      </Badge>
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 bg-popover border rounded-lg shadow-lg text-popover-foreground">
          <p className="font-medium text-sm mb-1 truncate">{source.documentName}</p>
          <p className="text-xs text-muted-foreground line-clamp-3">
            {source.chunkContent}
          </p>
          <p className="text-xs mt-2 text-primary">
            {t('similarity')}: {(source.similarity * 100).toFixed(0)}%
          </p>
        </div>
      )}
    </div>
  )
}
