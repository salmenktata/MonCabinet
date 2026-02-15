'use client'

import { useEffect, useRef, useMemo, memo } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { SourcesPanel } from './SourcesPanel'
import { useVirtualizedMessages } from '@/lib/hooks/useVirtualizedMessages'
import { AbrogationAlerts } from '@/components/chat/abrogation-alert' // Phase 3.4
import type { AbrogationAlert } from '@/types/abrogation-alerts' // Phase 3.4
import type { ModeConfig } from '@/app/(dashboard)/qadhya-ia/mode-config'

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
  abrogationAlerts?: AbrogationAlert[] // Phase 3.4
}

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading?: boolean
  streamingContent?: string
  modeConfig?: ModeConfig
  renderEnriched?: (message: ChatMessage) => React.ReactNode // Pour messages enrichis (structure/consult)
}

export function ChatMessages({ messages, isLoading, streamingContent, modeConfig, renderEnriched }: ChatMessagesProps) {
  const t = useTranslations('assistantIA')
  const tMode = useTranslations('qadhyaIA.modes')
  const messagesEndRef = useRef<HTMLDivElement>(null)

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
    const modeKey = modeConfig?.translationKey || 'chat'
    const ModeIcon = modeConfig ? Icons[modeConfig.icon] : Icons.messageSquare
    const iconBg = modeConfig?.iconBgClass || 'bg-primary/10'
    const iconText = modeConfig?.iconTextClass || 'text-primary'
    const badgeCls = modeConfig?.badgeClass || ''

    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className={cn('w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4', iconBg)}>
            <ModeIcon className={cn('h-8 w-8', iconText)} />
          </div>
          <h2 className="text-lg font-semibold mb-2">
            {modeConfig ? tMode(`${modeKey}.welcomeTitle`) : t('welcomeTitle')}
          </h2>
          <p className="text-muted-foreground text-sm">
            {modeConfig ? tMode(`${modeKey}.welcomeMessage`) : t('welcomeMessage')}
          </p>
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {modeConfig ? tMode(`${modeKey}.exampleQuestions`) : t('exampleQuestions')}
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {['ex1', 'ex2', 'ex3'].map((key) => (
                <Badge key={key} variant="outline" className={cn('cursor-default', badgeCls)}>
                  {modeConfig ? tMode(`${modeKey}.examples.${key}`) : t(`examples.${['civil', 'commercial', 'divorce'][['ex1', 'ex2', 'ex3'].indexOf(key)]}`)}
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
                <MessageBubble message={message} renderEnriched={renderEnriched} />
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
              renderEnriched={renderEnriched}
            />
          </div>
        )}

        {/* Indicateur de chargement */}
        {isLoading && !streamingContent && <LoadingIndicator />}
      </div>
    )
  }

  // Rendu standard pour < 50 messages avec animations
  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      <AnimatePresence mode="popLayout">
        {messages.map((message) => (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <MessageBubble message={message} renderEnriched={renderEnriched} />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Message en cours de streaming */}
      {streamingContent && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              createdAt: new Date(),
              isStreaming: true,
            }}
            renderEnriched={renderEnriched}
          />
        </motion.div>
      )}

      {/* Indicateur de chargement avec animation */}
      {isLoading && !streamingContent && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <LoadingIndicator />
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

function LoadingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Icons.loader className="h-4 w-4 text-primary" />
        </motion.div>
      </div>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  renderEnriched?: (message: ChatMessage) => React.ReactNode
}

const MessageBubble = memo(function MessageBubble({ message, renderEnriched }: MessageBubbleProps) {
  const t = useTranslations('assistantIA')
  const isUser = message.role === 'user'

  // Si renderEnriched fourni et message assistant, l'utiliser
  if (!isUser && renderEnriched) {
    return (
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Icons.zap className="h-4 w-4 text-primary" />
        </div>

        {/* Contenu enrichi */}
        <div className="flex-1 max-w-[85%]">
          {/* Phase 3.4 : Alertes abrogations */}
          {message.abrogationAlerts && message.abrogationAlerts.length > 0 && (
            <div className="mb-3">
              <AbrogationAlerts alerts={message.abrogationAlerts} />
            </div>
          )}

          {renderEnriched(message)}

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
        {/* Phase 3.4 : Alertes abrogations (affichées AVANT la réponse assistant) */}
        {!isUser && message.abrogationAlerts && message.abrogationAlerts.length > 0 && (
          <div className="mb-3">
            <AbrogationAlerts alerts={message.abrogationAlerts} />
          </div>
        )}

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
}, (prevProps, nextProps) => {
  // Custom comparison: ne re-render que si le message change vraiment
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.message.sources?.length === nextProps.message.sources?.length &&
    prevProps.renderEnriched === nextProps.renderEnriched
  )
})

