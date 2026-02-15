'use client'

/**
 * UnifiedChatPage - Interface unifiée Qadhya IA
 *
 * Fusion des 3 pages: Chat, Structuration, Consultation
 * Actions contextuelles pour choisir le mode d'interaction
 */

import { useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useToast } from '@/lib/hooks/use-toast'
import { FeatureErrorBoundary } from '@/components/providers/FeatureErrorBoundary'
import { ActionButtons, type ActionType } from '@/components/qadhya-ia/ActionButtons'
import { EnrichedMessage } from '@/components/qadhya-ia/EnrichedMessage'
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
  useSendMessage,
  useDeleteConversation,
} from '@/lib/hooks/useConversations'

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
  const { toast } = useToast()

  // State
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [currentAction, setCurrentAction] = useState<ActionType>(initialAction)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
  })

  const {
    data: selectedConversation,
    isLoading: isLoadingMessages,
  } = useConversation(selectedConversationId || '', {
    enabled: !!selectedConversationId,
  })

  // Mutations avec optimistic updates
  const { mutate: sendMessage, isPending: isSending } = useSendMessage({
    onSuccess: (data) => {
      // Si nouvelle conversation, la sélectionner
      if (!selectedConversationId && data.conversation.id) {
        setSelectedConversationId(data.conversation.id)
      }

      // Si c'est une structuration avec dossierId, rediriger
      if (currentAction === 'structure' && (data as any).dossierId) {
        router.push(`/dossiers/${(data as any).dossierId}`)
      }
    },
    onError: (error) => {
      toast({
        title: t('errors.sendFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const { mutate: deleteConversation } = useDeleteConversation({
    onSuccess: () => {
      toast({
        title: t('success.deleted'),
      })
    },
    onError: (error) => {
      toast({
        title: t('errors.deleteFailed'),
        variant: 'destructive',
      })
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

  const messages: ChatMessage[] = useMemo(() =>
    (selectedConversation?.messages || [])
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        createdAt: m.timestamp,
        sources: m.metadata?.sources?.map((s) => ({
          documentId: s.id,
          documentName: s.title,
          chunkContent: '',
          similarity: s.similarity,
        })),
        abrogationAlerts: m.metadata?.abrogationAlerts,
        metadata: m.metadata, // Conserver metadata pour actionType
      } as any)),
    [selectedConversation?.messages]
  )

  // Handlers
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
    setSidebarOpen(false)
  }, [])

  const handleNewConversation = useCallback(() => {
    setSelectedConversationId(null)
    setSidebarOpen(false)
  }, [])

  const handleDeleteConversation = useCallback((id: string) => {
    if (selectedConversationId === id) {
      setSelectedConversationId(null)
    }
    deleteConversation(id)
  }, [selectedConversationId, deleteConversation])

  const handleSendMessage = useCallback((content: string) => {
    sendMessage({
      conversationId: selectedConversationId || undefined,
      message: content,
      usePremiumModel: false,
      // Ajout du actionType dans les metadata (sera géré par l'API)
      actionType: currentAction,
    } as any)
  }, [selectedConversationId, currentAction, sendMessage])

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
        <h2 className="font-semibold text-lg">{t('title')}</h2>
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
      <div className={cn('h-[calc(100vh-4rem)] flex bg-gradient-to-br', modeConfig.gradientClass)}>
        {/* Sidebar - Desktop avec Glassmorphism */}
        <aside className="hidden lg:flex lg:w-80 xl:w-96 border-r flex-col backdrop-blur-xl bg-background/95">
          {SidebarContent}
        </aside>

        {/* Zone Chat Principale */}
        <main className="flex-1 flex flex-col">
          {/* Header Mobile */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Icons.menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 transition-transform duration-300 ease-out">
                {SidebarContent}
              </SheetContent>
            </Sheet>
            <Badge variant="outline" className={cn('gap-1.5', modeConfig.badgeClass)}>
              <ModeIcon className="h-3.5 w-3.5" />
              {t(`actions.${modeConfig.translationKey}.label`)}
            </Badge>
            <div className="w-10" /> {/* Spacer */}
          </div>

          {/* Messages avec Shadow Inner */}
          <div className="flex-1 overflow-auto shadow-inner">
            <ChatMessages
              messages={messages}
              isLoading={isLoadingMessages}
              modeConfig={modeConfig}
              // Utiliser EnrichedMessage pour les messages enrichis
              renderEnriched={(message) => <EnrichedMessage message={message} />}
            />
          </div>

          {/* Actions Contextuelles - CONDITIONNELLES */}
          {!hideActionButtons && (
            <div className="border-t p-4">
              <ActionButtons
                selected={currentAction}
                onSelect={handleActionSelect}
                disabled={isSending}
              />
            </div>
          )}

          {/* Input avec Shadow Subtile */}
          <div className="border-t shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
            <ChatInput
              onSend={handleSendMessage}
              disabled={isSending}
              placeholder={getPlaceholder()}
              modeConfig={modeConfig}
            />
          </div>
        </main>
      </div>
    </FeatureErrorBoundary>
  )
}
