'use client'

/**
 * UnifiedChatPage - Interface unifiée Qadhya IA
 *
 * Fusion des 3 pages: Chat, Structuration, Consultation
 * Actions contextuelles pour choisir le mode d'interaction
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { FeatureErrorBoundary } from '@/components/providers/FeatureErrorBoundary'
import { ActionButtons, type ActionType } from '@/components/qadhya-ia/ActionButtons'
import { EnrichedMessage } from '@/components/qadhya-ia/EnrichedMessage'
import { StanceSelector } from '@/components/qadhya-ia/StanceSelector'
import { ChatActions } from '@/components/assistant-ia/ChatActions'
import { MODE_CONFIGS } from './mode-config'
import {
  ConversationsList,
  type Conversation as ConvType,
} from '@/components/assistant-ia/ConversationsList'
import {
  ChatMessages,
  type ChatMessage,
} from '@/components/assistant-ia/ChatMessages'
import {
  ChatInput,
} from '@/components/assistant-ia/ChatInput'
import {
  useConversationList,
  useConversation,
  useDeleteConversation,
  conversationKeys,
} from '@/lib/hooks/useConversations'
import { useStreamingChat } from '@/lib/hooks/useStreamingChat'
import type { DocumentType } from '@/lib/categories/doc-types'
import { useStance } from '@/contexts/StanceContext'

const STORAGE_KEY = 'qadhya_last_conversation'

interface UnifiedChatPageProps {
  userId: string
  initialAction?: ActionType  // 'chat' | 'structure' | 'consult'
  hideActionButtons?: boolean // Masquer les boutons si page dédiée
}

export function UnifiedChatPage({
  userId,
  initialAction = 'chat',
  hideActionButtons = false
}: UnifiedChatPageProps) {
  const t = useTranslations('qadhyaIA')
  const router = useRouter()
  const queryClient = useQueryClient()

  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY)
    }
    return null
  })
  const [currentAction, setCurrentAction] = useState<ActionType>(initialAction)
  const { stance, setStance } = useStance()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Message utilisateur en attente (affiché immédiatement avant réponse serveur)
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null)
  // Clé pour déclencher l'auto-focus du textarea
  const [inputFocusKey, setInputFocusKey] = useState(0)

  // Persistance de la conversation sélectionnée en localStorage
  useEffect(() => {
    if (selectedConversationId) {
      localStorage.setItem(STORAGE_KEY, selectedConversationId)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [selectedConversationId])

  // Mode config dérivée de l'action courante
  const modeConfig = useMemo(() => MODE_CONFIGS[currentAction], [currentAction])
  const ModeIcon = useMemo(() => Icons[modeConfig.icon], [modeConfig.icon])

  // React Query hooks - Cache automatique
  const {
    data: conversationsData,
    isLoading: isLoadingConversations,
  } = useConversationList({
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    limit: 50,
    actionType: currentAction,
  })

  const {
    data: selectedConversation,
    isLoading: isLoadingMessages,
  } = useConversation(selectedConversationId || '', {
    enabled: !!selectedConversationId,
  })

  // Streaming chat - remplace useSendMessage pour affichage progressif
  const {
    isStreaming,
    streamingContent,
    sendMessage: streamSend,
    stopStreaming,
  } = useStreamingChat({
    onComplete: (_finalMessage, metadata) => {
      setPendingUserMessage(null)

      // Si nouvelle conversation, la sélectionner
      const convId = selectedConversationId || metadata?.conversationId
      if (!selectedConversationId && metadata?.conversationId) {
        setSelectedConversationId(metadata.conversationId)
      }

      // Invalider le cache pour rafraîchir depuis le serveur
      if (convId) {
        queryClient.invalidateQueries({
          queryKey: conversationKeys.detail(convId),
        })
      }
      queryClient.invalidateQueries({ queryKey: conversationKeys.lists() })
    },
    onError: (error) => {
      setPendingUserMessage(null)
      toast.error(`${t('errors.sendFailed')} — ${error.message}`)
    },
  })

  const { mutate: deleteConversation } = useDeleteConversation({
    onSuccess: () => {
      toast.success(t('success.deleted'))
    },
    onError: () => {
      toast.error(t('errors.deleteFailed'))
    },
  })

  // Données dérivées
  const conversations = useMemo(() =>
    (conversationsData?.conversations || []).map((c) => ({
      ...c,
      title: c.title as string | null,
    })) as ConvType[],
    [conversationsData?.conversations]
  )

  const messages: ChatMessage[] = useMemo(() => {
    const serverMessages = (selectedConversation?.messages || [])
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const rawSources = (m as any).sources || m.metadata?.sources
        return {
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          createdAt: m.timestamp,
          sources: rawSources?.map((s: any) => ({
            documentId: s.documentId || s.id,
            documentName: s.documentName || s.title,
            chunkContent: s.chunkContent || '',
            similarity: s.similarity,
          })),
          abrogationAlerts: m.metadata?.abrogationAlerts,
          qualityIndicator: m.metadata?.qualityIndicator,
          metadata: m.metadata,
        } as any
      })

    // Ajouter le message utilisateur en attente si streaming en cours
    if (isStreaming && pendingUserMessage) {
      const hasPending = serverMessages.some(
        (m) => m.role === 'user' && m.content === pendingUserMessage
      )
      if (!hasPending) {
        serverMessages.push({
          id: 'pending-user',
          role: 'user' as const,
          content: pendingUserMessage,
          createdAt: new Date(),
        })
      }
    }

    return serverMessages
  }, [selectedConversation?.messages, isStreaming, pendingUserMessage])

  // Titre de la conversation sélectionnée (pour ChatActions)
  const selectedConvTitle = useMemo(() =>
    conversations.find((c) => c.id === selectedConversationId)?.title || null,
    [conversations, selectedConversationId]
  )

  // Handlers
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
    setSidebarOpen(false)
    setInputFocusKey((k) => k + 1)
  }, [])

  const handleNewConversation = useCallback(() => {
    setSelectedConversationId(null)
    setSidebarOpen(false)
    setInputFocusKey((k) => k + 1)
  }, [])

  const handleDeleteConversation = useCallback((id: string) => {
    if (selectedConversationId === id) {
      setSelectedConversationId(null)
    }
    deleteConversation(id)
  }, [selectedConversationId, deleteConversation])

  const handleSendMessage = useCallback((content: string, options?: { docType?: DocumentType }) => {
    setPendingUserMessage(content)
    // Streaming SSE uniquement pour le mode 'chat' (structure/consult retournent du JSON)
    const useStream = currentAction === 'chat'
    streamSend(
      content,
      selectedConversationId || undefined,
      undefined,
      useStream,
      {
        actionType: currentAction,
        stance,
        ...(options?.docType ? { docType: options.docType } : {}),
      }
    )
  }, [selectedConversationId, currentAction, stance, streamSend])

  const handleActionSelect = useCallback((action: ActionType) => {
    setCurrentAction(action)
  }, [])

  // Placeholder dynamique selon l'action
  const getPlaceholder = () => {
    switch (currentAction) {
      case 'chat':
        return t('placeholders.chat')
      case 'structure':
        return t('placeholders.structure')
      case 'consult':
        return t('placeholders.consult')
    }
  }

  // Sidebar pour mobile et desktop
  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2.5 mb-1">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', modeConfig.iconBgClass)}>
            <ModeIcon className={cn('h-4 w-4', modeConfig.iconTextClass)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-sm tracking-tight">{t('title')}</h2>
              {/* Badge mode actif - desktop sidebar */}
              <Badge variant="outline" className={cn('gap-1 text-[10px] h-5 hidden lg:flex', modeConfig.badgeClass)}>
                <ModeIcon className="h-2.5 w-2.5" />
                {t(`actions.${modeConfig.translationKey}.label`)}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">{t(`actions.${modeConfig.translationKey}.description`)}</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ConversationsList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDelete={handleDeleteConversation}
          isLoading={isLoadingConversations}
        />
      </div>
    </div>
  )

  return (
    <FeatureErrorBoundary
      featureName="Qadhya IA"
      fallbackAction={{
        label: "Retour à l'accueil",
        onClick: () => router.push('/dashboard'),
      }}
    >
      <div className={cn('h-[calc(100vh-4rem)] flex bg-gradient-to-br -mx-4 -my-6 sm:-mx-6 lg:-mx-8', modeConfig.gradientClass)}>
        {/* Sidebar - Desktop (collapsible) */}
        <aside className={cn(
          'hidden lg:flex border-r flex-col bg-background/80 backdrop-blur-sm transition-all duration-300 overflow-hidden',
          sidebarCollapsed ? 'lg:w-0 border-0' : 'lg:w-72 xl:w-80'
        )}>
          {SidebarContent}
        </aside>

        {/* Zone Chat Principale */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header Mobile */}
          <div className="lg:hidden flex items-center justify-between px-3 py-2.5 border-b bg-background/80 backdrop-blur-sm">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <Icons.menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 transition-transform duration-300 ease-out">
                {SidebarContent}
              </SheetContent>
            </Sheet>
            <Badge variant="outline" className={cn('gap-1.5 text-xs', modeConfig.badgeClass)}>
              <ModeIcon className="h-3 w-3" />
              {t(`actions.${modeConfig.translationKey}.label`)}
            </Badge>
            <div className="w-9" />
          </div>

          {/* Header Desktop - bouton toggle sidebar */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 border-b bg-background/80 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSidebarCollapsed((c) => !c)}
              title={sidebarCollapsed ? 'Ouvrir la sidebar' : 'Réduire la sidebar'}
            >
              <Icons.chevronLeft className={cn(
                'h-4 w-4 transition-transform duration-200',
                sidebarCollapsed && 'rotate-180'
              )} />
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto">
            <div className="px-4 md:px-8">
              <ChatMessages
                messages={messages}
                isLoading={isLoadingMessages && !isStreaming}
                streamingContent={isStreaming ? (streamingContent || ' ') : undefined}
                modeConfig={modeConfig}
                renderEnriched={(message) => <EnrichedMessage message={message} />}
                onSendExample={(text) => handleSendMessage(text)}
              />
            </div>
          </div>

          {/* ChatActions - Exporter/Copier conversation */}
          {messages.length > 0 && !isStreaming && (
            <ChatActions
              hasMessages={messages.length > 0}
              conversationId={selectedConversationId}
              messages={messages}
              conversationTitle={selectedConvTitle || undefined}
            />
          )}

          {/* Zone basse : Tabs + Input */}
          <div className="border-t bg-background/80 backdrop-blur-sm">
            {/* Tabs de mode */}
            {!hideActionButtons && (
              <div className="pt-3 pb-1">
                <ActionButtons
                  selected={currentAction}
                  onSelect={handleActionSelect}
                  disabled={isStreaming}
                />
              </div>
            )}

            {/* Sélecteur de posture — visible pour chat et consult */}
            {(currentAction === 'chat' || currentAction === 'consult') && (
              <StanceSelector
                stance={stance}
                onChange={setStance}
                disabled={isStreaming}
              />
            )}

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              disabled={false}
              isStreaming={isStreaming}
              onStop={stopStreaming}
              placeholder={getPlaceholder()}
              modeConfig={modeConfig}
              focusKey={inputFocusKey}
            />
          </div>
        </main>
      </div>
    </FeatureErrorBoundary>
  )
}
