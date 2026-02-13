'use client'

/**
 * ChatPage - Assistant IA
 *
 * Sprint 6 - Migration React Query
 * Utilise hooks personnalisés pour cache intelligent et optimistic updates
 */

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useToast } from '@/lib/hooks/use-toast'
import { FeatureErrorBoundary } from '@/components/providers/FeatureErrorBoundary'
import { CreateDossierFromChatModal } from '@/components/chat/CreateDossierFromChatModal'
import {
  ConversationsList,
  ChatMessages,
  ChatInput,
  ChatActions,
  AdvancedSearch,
  type Conversation,
  type ChatMessage,
} from '@/components/assistant-ia'
import {
  useConversationList,
  useConversation,
  useSendMessage,
  useDeleteConversation,
} from '@/lib/hooks/useConversations'

interface ChatPageProps {
  userId: string
}

export function ChatPage({ userId }: ChatPageProps) {
  const t = useTranslations('assistantIA')
  const router = useRouter()
  const { toast } = useToast()

  // State (réduit grâce à React Query)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showCreateDossier, setShowCreateDossier] = useState(false)

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
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: error.message || t('errorSendingMessage'),
        variant: 'destructive',
      })
    },
  })

  const { mutate: deleteConversation } = useDeleteConversation({
    onSuccess: () => {
      toast({
        title: t('success'),
        description: t('conversationDeleted'),
      })
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: t('errorDeletingConversation'),
        variant: 'destructive',
      })
    },
  })

  // Données dérivées — mapper les types hook → types composant
  const conversations = useMemo(() =>
    (conversationsData?.conversations || []).map((c) => ({
      ...c,
      title: c.title as string | null,
    })) as Conversation[],
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
        abrogationAlerts: m.metadata?.abrogationAlerts, // Phase 3.4
      })),
    [selectedConversation?.messages]
  )

  // Handlers simplifiés
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id)
    setSidebarOpen(false)
  }

  const handleNewConversation = () => {
    setSelectedConversationId(null)
    setSidebarOpen(false)
  }

  const handleDeleteConversation = (id: string) => {
    // Si c'était la conversation active, la désélectionner
    if (selectedConversationId === id) {
      setSelectedConversationId(null)
    }

    // Mutation avec invalidation automatique du cache
    deleteConversation(id)
  }

  const handleSendMessage = (content: string) => {
    // Mutation avec optimistic update automatique
    sendMessage({
      conversationId: selectedConversationId || undefined,
      message: content,
      usePremiumModel: false, // TODO: lire depuis settings utilisateur
      maxDepth: 2,
    })

    setStreamingContent('')
  }

  // Créer un dossier depuis la conversation
  const handleCreateDossier = () => {
    // Ouvrir la modal d'extraction intelligente
    if (messages.length > 0 && selectedConversationId) {
      setShowCreateDossier(true)
    } else {
      toast({
        title: t('error'),
        description: 'Aucune conversation sélectionnée',
        variant: 'destructive',
      })
    }
  }

  // Sidebar pour mobile
  const SidebarContent = (
    <ConversationsList
      conversations={conversations}
      selectedId={selectedConversationId}
      onSelect={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onDelete={handleDeleteConversation}
      isLoading={isLoadingConversations}
    />
  )

  return (
    <FeatureErrorBoundary
      featureName="Chat IA"
      fallbackAction={{
        label: "Retour à l'accueil",
        onClick: () => router.push('/dashboard')
      }}
    >
      <div className="h-[calc(100vh-4rem)] flex">
        {/* Sidebar - Desktop */}
        <div className="hidden md:flex w-80 border-r bg-card flex-col">
          {SidebarContent}
        </div>

        {/* Zone principale */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="border-b px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Bouton menu mobile */}
              <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden">
                    <Icons.menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 p-0">
                  {SidebarContent}
                </SheetContent>
              </Sheet>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icons.zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="font-semibold">{t('title')}</h1>
                  <p className="text-xs text-muted-foreground hidden sm:block">
                    {selectedConversationId
                      ? conversations.find((c) => c.id === selectedConversationId)?.title ||
                        t('newConversation')
                      : t('newConversation')}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <AdvancedSearch
                onSelectConversation={(id) => {
                  setSelectedConversationId(id)
                  // Messages chargés automatiquement par useConversation(id)
                }}
              />

              <Button
                variant="outline"
                size="sm"
                onClick={handleNewConversation}
                className="hidden sm:flex"
              >
                <Icons.add className="h-4 w-4 mr-2" />
                {t('newConversation')}
              </Button>
            </div>
          </div>

          {/* Zone de chat */}
          <ChatMessages
            messages={messages}
            isLoading={isLoadingMessages || isSending}
            streamingContent={streamingContent}
          />

          {/* Actions contextuelles */}
          <ChatActions
            hasMessages={messages.length > 0}
            conversationId={selectedConversationId}
            messages={messages}
            conversationTitle={
              conversations.find((c) => c.id === selectedConversationId)?.title || undefined
            }
            onCreateDossier={handleCreateDossier}
          />

          {/* Input */}
          <ChatInput onSend={handleSendMessage} disabled={isSending} />
        </div>
      </div>

      {/* Modal création dossier depuis chat */}
      {selectedConversationId && (
        <CreateDossierFromChatModal
          open={showCreateDossier}
          onOpenChange={setShowCreateDossier}
          conversationId={selectedConversationId}
          messages={messages}
          conversationTitle={
            conversations.find((c) => c.id === selectedConversationId)?.title ?? undefined
          }
          onDossierCreated={(dossierId) => {
            toast({
              title: t('success'),
              description: 'Dossier créé avec succès',
            })
          }}
        />
      )}
    </FeatureErrorBoundary>
  )
}
