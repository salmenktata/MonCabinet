'use client'

import { useState, useEffect, useRef, useMemo, memo } from 'react'
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
  qualityIndicator?: 'high' | 'medium' | 'low'
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
  const [copied, setCopied] = useState(false)

  const handleCopyResponse = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Si renderEnriched fourni et message assistant, l'utiliser
  if (!isUser && renderEnriched) {
    return (
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
          <Icons.zap className="h-4 w-4 text-primary" />
        </div>

        {/* Contenu enrichi */}
        <div className="flex-1 max-w-[95%]">
          {/* Label assistant */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-primary">Qadhya IA</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>

          {/* Phase 3.4 : Alertes abrogations */}
          {message.abrogationAlerts && message.abrogationAlerts.length > 0 && (
            <div className="mb-3">
              <AbrogationAlerts alerts={message.abrogationAlerts} />
            </div>
          )}

          {renderEnriched(message)}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1',
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
      <div className={cn('flex-1', isUser ? 'max-w-[85%] flex flex-col items-end' : 'max-w-[95%]')}>
        {/* Phase 3.4 : Alertes abrogations (affichées AVANT la réponse assistant) */}
        {!isUser && message.abrogationAlerts && message.abrogationAlerts.length > 0 && (
          <div className="mb-3">
            <AbrogationAlerts alerts={message.abrogationAlerts} />
          </div>
        )}

        {isUser ? (
          // Message utilisateur : bubble compact
          <div className="rounded-2xl px-4 py-3 text-sm bg-primary text-primary-foreground rounded-tr-sm">
            <div className="whitespace-pre-wrap break-words">
              {message.content}
            </div>
          </div>
        ) : (
          // Message assistant : design aéré type document
          <div className="group relative">
            {/* Label assistant */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-primary">Qadhya IA</span>
              <span className="text-xs text-muted-foreground">
                {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* Contenu markdown */}
            <div className="rounded-xl border border-border/60 bg-card px-5 py-4 shadow-sm">
              <MarkdownMessage
                content={message.content}
                sources={message.sources}
              />
              {message.isStreaming && (
                <span className="inline-block w-0.5 h-5 ml-1 bg-primary animate-blink" />
              )}

              {/* Indicateur "typing..." pour le streaming */}
              {message.isStreaming && !message.content && (
                <div className="flex items-center gap-1.5 py-2">
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>

            {/* Barre d'actions sous le message */}
            {!message.isStreaming && (
              <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopyResponse}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  title="Copier la réponse"
                >
                  {copied ? (
                    <><Icons.check className="h-3 w-3 text-green-500" /> <span className="text-green-500">Copié</span></>
                  ) : (
                    <><Icons.copy className="h-3 w-3" /> <span>Copier</span></>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Panneau Sources enrichi */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3">
            <SourcesPanel sources={message.sources} qualityIndicator={message.qualityIndicator} />
          </div>
        )}

        {/* Timestamp (utilisateur uniquement, assistant a le sien dans le label) */}
        {isUser && (
          <div className="mt-1 text-xs text-muted-foreground">
            {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        )}
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

