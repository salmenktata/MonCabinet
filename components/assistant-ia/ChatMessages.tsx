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
import { MessageFeedback } from '@/components/chat/MessageFeedback'
import type { AbrogationAlert } from '@/types/abrogation-alerts' // Phase 3.4
import type { ModeConfig } from '@/app/(dashboard)/qadhya-ia/mode-config'
import type { ProgressStep } from '@/lib/hooks/useStreamingChat'

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
  currentMetadata?: { sources?: unknown[]; model?: string } | null
  progressSteps?: ProgressStep[]
  modeConfig?: ModeConfig
  renderEnriched?: (message: ChatMessage) => React.ReactNode
  onSendExample?: (text: string) => void
  canProvideFeedback?: boolean
  onResendMessage?: (content: string) => void
}

export function ChatMessages({ messages, isLoading, streamingContent, currentMetadata, progressSteps, modeConfig, renderEnriched, onSendExample, canProvideFeedback = false, onResendMessage }: ChatMessagesProps) {
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
                <MessageBubble message={message} renderEnriched={renderEnriched} canProvideFeedback={canProvideFeedback} onResendMessage={onResendMessage} />
              </div>
            )
          })}
        </div>

        {/* Message en cours de streaming */}
        {streamingContent && (
          <div className="pb-4">
            {/* Source title chips (avant que le texte commence, après metadata reçu) */}
            {!streamingContent.trim() && (currentMetadata?.sources?.length ?? 0) > 0 && (
              <SourceChips sources={currentMetadata!.sources as unknown[]} />
            )}
            <MessageBubble
              message={{
                id: 'streaming',
                role: 'assistant',
                content: streamingContent,
                createdAt: new Date(),
                isStreaming: true,
              }}
              progressSteps={progressSteps}
              renderEnriched={renderEnriched}
            />
          </div>
        )}

        {/* Indicateur de chargement */}
        {isLoading && !streamingContent && <LoadingIndicator progressSteps={progressSteps} />}
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
            <MessageBubble message={message} renderEnriched={renderEnriched} canProvideFeedback={canProvideFeedback} onResendMessage={onResendMessage} />
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
          {/* Source title chips (avant que le texte commence, après metadata reçu) */}
          {!streamingContent.trim() && (currentMetadata?.sources?.length ?? 0) > 0 && (
            <SourceChips sources={currentMetadata!.sources as unknown[]} />
          )}
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              createdAt: new Date(),
              isStreaming: true,
            }}
            progressSteps={progressSteps}
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
          <LoadingIndicator progressSteps={progressSteps} />
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}

const LOADING_STEPS = [
  { icon: 'search' as const, text: 'Recherche dans la base juridique...' },
  { icon: 'bookOpen' as const, text: 'Analyse des sources pertinentes...' },
  { icon: 'scale' as const, text: 'Rédaction de la réponse juridique...' },
  { icon: 'loader' as const, text: 'Finalisation en cours...' },
]

function LoadingIndicator({ progressSteps }: { progressSteps?: ProgressStep[] }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  const stepIndex = elapsed < 3 ? 0 : elapsed < 8 ? 1 : elapsed < 15 ? 2 : 3

  return (
    <div className="flex items-start gap-3">
      {/* Avatar IA avec rotation continue */}
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0 mt-1">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
        >
          <Icons.loader className="h-4 w-4 text-primary" />
        </motion.div>
      </div>

      <div className="flex-1 max-w-[95%]">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Qadhya IA
          </span>
          {!progressSteps?.length && (
            <span className="text-xs font-mono font-medium text-muted-foreground/80 tabular-nums bg-muted/50 px-1.5 py-0.5 rounded">
              {elapsed}s
            </span>
          )}
        </div>

        {/* Card : ThinkingLog réel si progress events reçus, sinon timer statique */}
        <div className="rounded-2xl rounded-tl-md bg-card/80 border border-border/50 px-4 py-3">
          {progressSteps && progressSteps.length > 0 ? (
            <ThinkingLog steps={progressSteps} />
          ) : (
            <div className="space-y-2">
              {LOADING_STEPS.map((step, i) => {
                const StepIcon = Icons[step.icon]
                const isDone = i < stepIndex
                const isCurrent = i === stepIndex
                const isPending = i > stepIndex

                return (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center gap-2.5 text-sm transition-all duration-300',
                      isDone && 'text-muted-foreground/50',
                      isCurrent && 'text-foreground',
                      isPending && 'text-muted-foreground/25'
                    )}
                  >
                    {isDone ? (
                      <Icons.check className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                    ) : isCurrent ? (
                      <motion.div
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                      >
                        <StepIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                      </motion.div>
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/20 shrink-0" />
                    )}
                    <span className={cn('text-sm', isCurrent && 'font-medium')}>
                      {step.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  progressSteps?: ProgressStep[]
  renderEnriched?: (message: ChatMessage) => React.ReactNode
  canProvideFeedback?: boolean
  onResendMessage?: (content: string) => void
}

const MessageBubble = memo(function MessageBubble({ message, progressSteps, renderEnriched, canProvideFeedback = false, onResendMessage }: MessageBubbleProps) {
  const t = useTranslations('assistantIA')
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)

  const handleCopyResponse = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleResend = () => {
    if (editContent.trim() && onResendMessage) {
      onResendMessage(editContent.trim())
      setIsEditing(false)
    }
  }

  // Message utilisateur
  if (isUser) {
    return (
      <div className="flex items-start gap-3 flex-row-reverse">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Icons.user className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="max-w-[80%] flex flex-col items-end group">
          {isEditing ? (
            <div className="w-full min-w-[280px] rounded-2xl rounded-tr-sm border border-primary/30 bg-card shadow-sm overflow-hidden">
              <textarea
                className="w-full px-4 py-3 text-base bg-transparent resize-none outline-none leading-relaxed min-h-[80px]"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleResend()
                  if (e.key === 'Escape') setIsEditing(false)
                }}
                autoFocus
              />
              <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/30 bg-muted/30">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                >
                  <Icons.x className="h-3 w-3" />
                  <span>Annuler</span>
                </button>
                <button
                  onClick={handleResend}
                  disabled={!editContent.trim()}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <Icons.arrowUp className="h-3 w-3" />
                  <span>Renvoyer</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl rounded-tr-sm px-4 py-3 text-base bg-gradient-to-br from-primary to-primary/90 text-primary-foreground shadow-sm">
              <div className="whitespace-pre-wrap break-words leading-relaxed">
                {message.content}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5 me-1">
            {/* Actions au hover (mode normal uniquement) */}
            {!isEditing && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                  onClick={handleCopyResponse}
                  className={cn(
                    'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition-all duration-200',
                    copied
                      ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  title={t('copyMessage')}
                >
                  {copied ? (
                    <><Icons.check className="h-3 w-3" /> <span>{t('copied')}</span></>
                  ) : (
                    <Icons.copy className="h-3 w-3" />
                  )}
                </button>
                {onResendMessage && (
                  <button
                    onClick={() => { setEditContent(message.content); setIsEditing(true) }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                    title={t('editAndResend')}
                  >
                    <Icons.edit className="h-3 w-3" />
                  </button>
                )}
              </div>
            )}
            <span className="text-[11px] text-muted-foreground/50">
              {new Date(message.createdAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
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
      <div className="flex-1 min-w-0 max-w-[95%]">
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
            {/* Streaming sans contenu textuel réel → ThinkingLog ou dots */}
            {message.isStreaming && !message.content?.trim() ? (
              progressSteps && progressSteps.length > 0
                ? <ThinkingLog steps={progressSteps} />
                : (
                  <div className="flex items-center gap-1 py-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '0ms', animationDuration: '1.4s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '200ms', animationDuration: '1.4s' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-pulse" style={{ animationDelay: '400ms', animationDuration: '1.4s' }} />
                  </div>
                )
            ) : renderEnriched ? (
              renderEnriched(message)
            ) : (
              <>
                <div className="text-base">
                  <MarkdownMessage
                    content={message.content}
                    sources={message.sources}
                  />
                  {message.isStreaming && (
                    <span className="inline-block w-0.5 h-5 ml-1 bg-primary animate-blink" />
                  )}
                </div>
              </>
            )}
          </div>

          {/* Barre d'actions - en bas de la carte */}
          {!message.isStreaming && (
            <div className="flex items-center justify-between gap-0.5 px-3 py-1.5 border-t border-border/20 opacity-0 group-hover:opacity-100 transition-all duration-300">
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleCopyResponse}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-all duration-200',
                    copied
                      ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  title={t('copyResponse')}
                >
                  {copied ? (
                    <><Icons.check className="h-3 w-3" /> <span>{t('copied')}</span></>
                  ) : (
                    <><Icons.copy className="h-3 w-3" /> <span>{t('copy')}</span></>
                  )}
                </button>
              </div>
              {/* Feedback thumbs up/down */}
              <MessageFeedback
                messageId={message.id}
                canProvideFeedback={canProvideFeedback}
                className="shrink-0"
              />
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
    prevProps.renderEnriched === nextProps.renderEnriched &&
    prevProps.canProvideFeedback === nextProps.canProvideFeedback &&
    prevProps.onResendMessage === nextProps.onResendMessage &&
    prevProps.progressSteps?.length === nextProps.progressSteps?.length
  )
})

// --- ThinkingLog : étapes réelles du pipeline RAG en temps réel ---

const THINKING_STEPS = [
  {
    key: 'searching' as const,
    icon: 'search' as const,
    label: () => 'Recherche dans la base juridique',
  },
  {
    key: 'sources_found' as const,
    icon: 'bookOpen' as const,
    label: (step: ProgressStep) =>
      step.count != null
        ? `${step.count} source${step.count !== 1 ? 's' : ''} trouvée${step.count !== 1 ? 's' : ''} · ${step.avgSimilarity ?? 0}% de pertinence`
        : 'Analyse des sources...',
  },
  {
    key: 'generating' as const,
    icon: 'scale' as const,
    label: () => 'Rédaction de la réponse juridique',
  },
]

function ThinkingLog({ steps }: { steps: ProgressStep[] }) {
  const completedKeys = steps.map((s) => s.step)
  const lastKey = completedKeys[completedKeys.length - 1]

  return (
    <div className="py-1 space-y-2">
      {THINKING_STEPS.map((config) => {
        const matchingStep = steps.find((s) => s.step === config.key)
        const isDone = completedKeys.includes(config.key) && config.key !== lastKey
        const isCurrent = config.key === lastKey
        const isPending = !completedKeys.includes(config.key)
        const StepIcon = Icons[config.icon]
        const labelText = matchingStep
          ? config.label(matchingStep)
          : config.label({ step: config.key, timestamp: 0 })

        return (
          <motion.div
            key={config.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'flex items-center gap-2.5 text-sm transition-all duration-300',
              isDone && 'text-muted-foreground/40',
              isCurrent && 'text-foreground',
              isPending && 'text-muted-foreground/20'
            )}
          >
            {isDone ? (
              <Icons.check className="h-3.5 w-3.5 text-primary/50 shrink-0" />
            ) : isCurrent ? (
              <motion.div
                animate={{ opacity: [1, 0.35, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              >
                <StepIcon className="h-3.5 w-3.5 text-primary shrink-0" />
              </motion.div>
            ) : (
              <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/15 shrink-0" />
            )}
            <span className={cn(isCurrent && 'font-medium')}>{labelText}</span>
          </motion.div>
        )
      })}
    </div>
  )
}

// --- SourceChips : titre des 3 premières sources avant que le texte commence ---

function SourceChips({ sources }: { sources: unknown[] }) {
  const count = sources.length
  if (count === 0) return null

  const top3 = sources.slice(0, 3) as Array<Record<string, unknown>>

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="ms-11 mb-2 space-y-1"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
        <Icons.bookOpen className="h-3 w-3" />
        <span>{count} source{count !== 1 ? 's' : ''} consultée{count !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {top3.map((src, i) => {
          const title =
            (src.title as string | undefined) ??
            (src.documentName as string | undefined) ??
            'Source'
          return (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-full bg-primary/8 border border-primary/15 text-[11px] text-muted-foreground/70 max-w-[200px] truncate"
            >
              {title}
            </span>
          )
        })}
        {count > 3 && (
          <span className="text-[11px] text-muted-foreground/40 self-center">
            +{count - 3}
          </span>
        )}
      </div>
    </motion.div>
  )
}

