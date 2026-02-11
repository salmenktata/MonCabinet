'use client'

/**
 * ChatWidget - Assistant IA Dossier
 *
 * Sprint 6 - Migration React Query
 * Utilise useSendMessage() pour optimistic updates automatiques
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  MessageSquare,
  Send,
  Loader2,
  ChevronDown,
  FileText,
  BookOpen,
  Sparkles,
  Trash2,
  Plus,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSendMessage, useConversation } from '@/lib/hooks/useConversations'

// =============================================================================
// TYPES
// =============================================================================

interface ChatSource {
  documentId: string
  documentName: string
  chunkContent: string
  similarity: number
  metadata?: Record<string, unknown>
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: ChatSource[]
  createdAt: Date
}

interface ChatWidgetProps {
  dossierId: string
  dossierNumero: string
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ChatWidget({ dossierId, dossierNumero }: ChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // React Query hooks
  const { data: conversation } = useConversation(conversationId || '', {
    enabled: !!conversationId,
  })

  const { mutate: sendMessageMutation, isPending: loading } = useSendMessage({
    onSuccess: (data) => {
      if (!conversationId && data.conversation.id) {
        setConversationId(data.conversation.id)
      }
      setError(null)
    },
    onError: (err) => {
      setError(err.message || 'Erreur inconnue')
    },
  })

  // Données dérivées — mapper Message → ChatMessage
  const messages: ChatMessage[] = useMemo(() =>
    (conversation?.messages || [])
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
      })),
    [conversation?.messages]
  )

  // Auto-scroll vers le bas quand nouveaux messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input quand le panel s'ouvre
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Envoyer un message - Simplifié avec React Query
  const sendMessage = useCallback(() => {
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')

    sendMessageMutation({
      conversationId: conversationId || undefined,
      message: question,
      usePremiumModel: false,
      maxDepth: 2,
    })
  }, [input, loading, conversationId, sendMessageMutation])

  // Gestion du clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Nouvelle conversation
  const startNewConversation = () => {
    setConversationId(null)
    setError(null)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Assistant IA
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:w-[500px] p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <SheetTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                Qadhya - Assistant Juridique
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Dossier {dossierNumero}
              </p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={startNewConversation}
                title="Nouvelle conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 space-y-4">
            {messages.length === 0 && !loading && (
              <WelcomeMessage />
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Qadhya réfléchit...</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-background">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Posez une question sur ce dossier..."
              disabled={loading}
              className="flex-1"
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            L'IA peut faire des erreurs. Vérifiez toujours les informations importantes.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// =============================================================================
// SOUS-COMPOSANTS
// =============================================================================

function WelcomeMessage() {
  return (
    <div className="text-center py-8">
      <Sparkles className="h-12 w-12 mx-auto text-indigo-500/50 mb-4" />
      <h3 className="font-medium text-lg">Bienvenue !</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
        Je suis Qadhya, votre assistant juridique. Posez-moi des questions sur ce dossier.
      </p>
      <div className="mt-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-medium">Exemples de questions :</p>
        <ul className="space-y-1">
          <li>"Quelles sont les dates importantes du dossier ?"</li>
          <li>"Résume les dernières pièces versées"</li>
          <li>"Quels articles de loi s'appliquent ?"</li>
        </ul>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex flex-col',
        isUser ? 'items-end' : 'items-start'
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-4 py-2',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>

      {/* Sources */}
      {message.sources && message.sources.length > 0 && (
        <SourcesList sources={message.sources} />
      )}

      <span className="text-[10px] text-muted-foreground mt-1">
        {message.createdAt.toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </div>
  )
}

function SourcesList({ sources }: { sources: ChatSource[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2 w-full max-w-[85%]">
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <FileText className="h-3 w-3 mr-1" />
          {sources.length} source{sources.length > 1 ? 's' : ''}
          <ChevronDown
            className={cn(
              'h-3 w-3 ml-1 transition-transform',
              isOpen && 'rotate-180'
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {sources.map((source, index) => (
          <SourceCard key={`${source.documentId}-${index}`} source={source} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  )
}

function SourceCard({ source }: { source: ChatSource }) {
  const isJurisprudence = (source.metadata as any)?.type === 'jurisprudence'

  return (
    <div className="p-2 rounded border bg-background text-xs">
      <div className="flex items-center gap-2 mb-1">
        {isJurisprudence ? (
          <BookOpen className="h-3 w-3 text-amber-600" />
        ) : (
          <FileText className="h-3 w-3 text-purple-600" />
        )}
        <span className="font-medium truncate flex-1">
          {source.documentName}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {Math.round(source.similarity * 100)}%
        </Badge>
      </div>
      <p className="text-muted-foreground line-clamp-3">
        {source.chunkContent.substring(0, 200)}...
      </p>
    </div>
  )
}
