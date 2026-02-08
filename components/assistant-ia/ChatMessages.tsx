'use client'

import { useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SourcesPanel } from './SourcesPanel'
import { useVirtualizedMessages, useShouldVirtualize } from '@/lib/hooks/useVirtualizedMessages'

const MarkdownMessage = dynamic(
  () => import('./MarkdownMessage').then(mod => mod.MarkdownMessage),
  {
    loading: () => (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    ),
  }
)

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

  // Virtualisation pour les longues conversations (50+ messages)
  const shouldVirtualize = useShouldVirtualize(messages.length, 50)

  // Convertir les messages pour le hook de virtualisation
  const virtualMessages = useMemo(() =>
    messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.createdAt?.toISOString(),
      sources: m.sources,
    })),
    [messages]
  )

  const {
    containerRef,
    isVirtualized,
    virtualItems,
    totalHeight,
    scrollToBottom,
    measureElement,
  } = useVirtualizedMessages(virtualMessages, {
    threshold: 50,
    overscan: 5,
    autoScrollToBottom: true,
  })

  // Auto-scroll vers le bas pour les conversations non virtualisées
  useEffect(() => {
    if (!isVirtualized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingContent, isVirtualized])

  if (messages.length === 0 && !isLoading && !streamingContent) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Icons.messageSquare className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">{t('welcomeTitle')}</h2>
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

  // Rendu virtualisé pour 50+ messages
  if (isVirtualized) {
    return (
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4">
        <div
          style={{
            height: `${totalHeight}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const message = messages[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                ref={measureElement}
                data-index={virtualItem.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="pb-4"
              >
                <MessageBubble message={message} />
              </div>
            )
          })}
        </div>

        {/* Message en cours de streaming */}
        {streamingContent && (
          <div className="pb-4">
            <MessageBubble
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamingContent,
                createdAt: new Date(),
                isStreaming: true,
              }}
            />
          </div>
        )}

        {/* Indicateur de chargement */}
        {isLoading && !streamingContent && <LoadingIndicator />}
      </div>
    )
  }

  // Rendu standard pour < 50 messages
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
      {isLoading && !streamingContent && <LoadingIndicator />}

      <div ref={messagesEndRef} />
    </div>
  )
}

function LoadingIndicator() {
  return (
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

