'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { useToast } from '@/lib/hooks/use-toast'
import {
  ConversationsList,
  ChatMessages,
  ChatInput,
  ChatActions,
  AdvancedSearch,
  type Conversation,
  type ChatMessage,
  type ChatSource,
} from '@/components/assistant-ia'

interface ChatPageProps {
  userId: string
}

export function ChatPage({ userId }: ChatPageProps) {
  const t = useTranslations('assistantIA')
  const router = useRouter()
  const { toast } = useToast()

  // State
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Charger les conversations
  const loadConversations = useCallback(async () => {
    try {
      setIsLoadingConversations(true)
      const response = await fetch('/api/chat')
      if (!response.ok) throw new Error('Erreur chargement conversations')
      const data = await response.json()
      setConversations(data.conversations || [])
    } catch (error) {
      console.error('Erreur chargement conversations:', error)
      toast({
        title: t('error'),
        description: t('errorLoadingConversations'),
        variant: 'destructive',
      })
    } finally {
      setIsLoadingConversations(false)
    }
  }, [toast, t])

  // Charger les messages d'une conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setIsLoadingMessages(true)
      const response = await fetch(`/api/chat?conversationId=${conversationId}`)
      if (!response.ok) throw new Error('Erreur chargement messages')
      const data = await response.json()
      setMessages(
        (data.messages || []).map((m: any) => ({
          ...m,
          createdAt: new Date(m.createdAt),
        }))
      )
    } catch (error) {
      console.error('Erreur chargement messages:', error)
      toast({
        title: t('error'),
        description: t('errorLoadingMessages'),
        variant: 'destructive',
      })
    } finally {
      setIsLoadingMessages(false)
    }
  }, [toast, t])

  // Charger au montage
  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  // Charger les messages quand une conversation est sélectionnée
  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId)
    } else {
      setMessages([])
    }
  }, [selectedConversationId, loadMessages])

  // Sélectionner une conversation
  const handleSelectConversation = (id: string) => {
    setSelectedConversationId(id)
    setSidebarOpen(false)
  }

  // Nouvelle conversation
  const handleNewConversation = () => {
    setSelectedConversationId(null)
    setMessages([])
    setSidebarOpen(false)
  }

  // Supprimer une conversation
  const handleDeleteConversation = async (id: string) => {
    try {
      const response = await fetch(`/api/chat?conversationId=${id}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new Error('Erreur suppression')

      // Mettre à jour la liste
      setConversations((prev) => prev.filter((c) => c.id !== id))

      // Si c'était la conversation active, la désélectionner
      if (selectedConversationId === id) {
        setSelectedConversationId(null)
        setMessages([])
      }

      toast({
        title: t('success'),
        description: t('conversationDeleted'),
      })
    } catch (error) {
      console.error('Erreur suppression:', error)
      toast({
        title: t('error'),
        description: t('errorDeletingConversation'),
        variant: 'destructive',
      })
    }
  }

  // Envoyer un message
  const handleSendMessage = async (content: string) => {
    try {
      setIsSending(true)

      // Ajouter le message utilisateur localement
      const userMessage: ChatMessage = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])

      // Appeler l'API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: content,
          conversationId: selectedConversationId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erreur envoi message')
      }

      const data = await response.json()

      // Ajouter la réponse de l'assistant
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        createdAt: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])

      // Si nouvelle conversation, la sélectionner et recharger la liste
      if (!selectedConversationId && data.conversationId) {
        setSelectedConversationId(data.conversationId)
        loadConversations()
      }
    } catch (error) {
      console.error('Erreur envoi message:', error)
      toast({
        title: t('error'),
        description: error instanceof Error ? error.message : t('errorSendingMessage'),
        variant: 'destructive',
      })
      // Retirer le message utilisateur en cas d'erreur
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsSending(false)
      setStreamingContent('')
    }
  }

  // Créer un dossier depuis la conversation
  const handleCreateDossier = () => {
    // Rediriger vers l'assistant mode rapide avec le contexte
    if (messages.length > 0) {
      const lastUserMessage = messages.filter((m) => m.role === 'user').pop()
      if (lastUserMessage) {
        router.push(`/dossiers/assistant?narratif=${encodeURIComponent(lastUserMessage.content)}`)
      }
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
                loadMessages(id)
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
  )
}
