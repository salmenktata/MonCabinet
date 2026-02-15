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
  renderEnriched?: (message: ChatMessage) => React.ReactNode
  onSendExample?: (text: string) => void
}

export function ChatMessages({ messages, isLoading, streamingContent, modeConfig, renderEnriched, onSendExample }: ChatMessagesProps) {
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

    const examples = ['ex1', 'ex2', 'ex3'].map((key) =>
      modeConfig ? tMode(`${modeKey}.examples.${key}`) : t(`examples.${['civil', 'commercial', 'divorce'][['ex1', 'ex2', 'ex3'].indexOf(key)]}`)
    )

    return (
      <div className="flex-1 flex items-center justify-center p-6 md:p-8">
        <motion.div
          className="text-center max-w-lg w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5',
            'shadow-sm',
            iconBg
          )}>
            <ModeIcon className={cn('h-7 w-7', iconText)} />
          </div>
          <h2 className="text-xl font-semibold mb-2 tracking-tight">
            {modeConfig ? tMode(`${modeKey}.welcomeTitle`) : t('welcomeTitle')}
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
            {modeConfig ? tMode(`${modeKey}.welcomeMessage`) : t('welcomeMessage')}
          </p>

          <div className="mt-8">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              {modeConfig ? tMode(`${modeKey}.exampleQuestions`) : t('exampleQuestions')}
            </p>
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {examples.map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => onSendExample?.(example)}
                  className={cn(
                    'group text-start px-4 py-3 rounded-xl border bg-card/50 backdrop-blur-sm',
                    'hover:bg-card hover:shadow-md hover:border-primary/20',
                    'transition-all duration-200 ease-out',
                    'text-sm text-muted-foreground hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icons.arrowUp className={cn(
                      'h-4 w-4 shrink-0 rotate-45 opacity-0 group-hover:opacity-100',
                      'transition-all duration-200',
                      iconText
                    )} />
                    <span className="line-clamp-2">{example}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
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
    <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
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
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
        >
          <Icons.loader className="h-4 w-4 text-primary" />
        </motion.div>
      </div>
      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Qadhya IA
          </span>
          <span className="text-[11px] text-muted-foreground/50">en cours...</span>
        </div>
        <div className="rounded-2xl rounded-tl-md bg-card/80 border border-border/50 p-5 space-y-3">
          <Skeleton className="h-3 w-[90%] rounded-full" />
          <Skeleton className="h-3 w-[65%] rounded-full" />
          <Skeleton className="h-3 w-[78%] rounded-full" />
          <Skeleton className="h-3 w-[45%] rounded-full" />
        </div>
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

  // Message utilisateur
  if (isUser) {
    return (
      <div className="flex items-start gap-3 flex-row-reverse">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Icons.user className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="max-w-[80%] flex flex-col items-end">
          <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-sm bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-sm">
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {message.content}
            </div>
          </div>
          <span className="text-[11px] text-muted-foreground/50 mt-1.5 me-1">
            {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    )
  }

  // Message assistant - Rendu enrichi ou standard
  return (
    <div className="flex items-start gap-3">
      {/* Avatar IA */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Icons.zap className="h-4 w-4 text-primary" />
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        {/* Header assistant */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-xs font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Qadhya IA
          </span>
          <span className="text-muted-foreground/30 text-[10px]">&#183;</span>
          <span className="text-[11px] text-muted-foreground/40 tabular-nums">
            {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Alertes abrogations */}
        {message.abrogationAlerts && message.abrogationAlerts.length > 0 && (
          <div className="mb-3">
            <AbrogationAlerts alerts={message.abrogationAlerts} />
          </div>
        )}

        {/* Carte réponse */}
        <div className="group rounded-2xl rounded-tl-md bg-card/80 border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-300">
          <div className="px-5 py-4">
            {renderEnriched ? (
              renderEnriched(message)
            ) : (
              <>
                <div className="text-sm">
                  <MarkdownMessage
                    content={message.content}
                    sources={message.sources}
                  />
                  {message.isStreaming && (
                    <span className="inline-block w-0.5 h-5 ml-1 bg-primary animate-blink" />
                  )}
                  {message.isStreaming && !message.content && (
                    <div className="flex items-center gap-1 py-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '200ms', animationDuration: '1.4s' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1.4s' }} />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Barre d'actions - en bas de la carte */}
          {!message.isStreaming && (
            <div className="flex items-center gap-0.5 px-3 py-1.5 border-t border-border/20 opacity-0 group-hover:opacity-100 transition-all duration-300">
              <button
                onClick={handleCopyResponse}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all duration-200',
                  copied
                    ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                title="Copier la réponse"
              >
                {copied ? (
                  <><Icons.check className="h-3 w-3" /> <span>Copié</span></>
                ) : (
                  <><Icons.copy className="h-3 w-3" /> <span>Copier</span></>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Panneau Sources - en dehors de la carte */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3">
            <SourcesPanel sources={message.sources} qualityIndicator={message.qualityIndicator} />
          </div>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.isStreaming === nextProps.message.isStreaming &&
    prevProps.message.sources?.length === nextProps.message.sources?.length &&
    prevProps.renderEnriched === nextProps.renderEnriched
  )
})

