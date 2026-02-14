'use client'

import { useState, useRef, useMemo, memo } from 'react'
import { useTranslations } from 'next-intl'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePrefetchConversation } from '@/lib/hooks/useConversations'

const VIRTUALIZATION_THRESHOLD = 50
const ITEM_HEIGHT = 68 // hauteur approximative d'un item

export interface Conversation {
  id: string
  title: string | null
  dossierId?: string | null
  dossierNumero?: string | null
  messageCount?: number
  lastMessageAt?: Date
  updatedAt?: Date
  createdAt?: Date
}

interface ConversationsListProps {
  conversations: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNewConversation: () => void
  onDelete: (id: string) => void | Promise<void>
  isLoading?: boolean
}

export function ConversationsList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onDelete,
  isLoading = false,
}: ConversationsListProps) {
  const t = useTranslations('assistantIA')
  const prefetchConversation = usePrefetchConversation()
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const filteredConversations = useMemo(() =>
    conversations.filter((conv) => {
      const title = conv.title || t('newConversation')
      return title.toLowerCase().includes(searchQuery.toLowerCase())
    }),
    [conversations, searchQuery, t]
  )

  // Virtualisation pour les longues listes (50+)
  const shouldVirtualize = filteredConversations.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
    enabled: shouldVirtualize,
  })

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    try {
      await onDelete(deleteId)
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  const formatDate = (date: Date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Hier'
    } else if (days < 7) {
      return `${days}j`
    } else {
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <Button onClick={onNewConversation} className="w-full" size="sm">
          <Icons.add className="h-4 w-4 mr-2" />
          {t('newConversation')}
        </Button>
        <div className="relative">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchConversations')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Liste */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {searchQuery ? t('noResults') : t('noConversations')}
          </div>
        ) : shouldVirtualize ? (
          // Rendu virtualisé pour 50+ conversations
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const conv = filteredConversations[virtualItem.index]
              return (
                <div
                  key={virtualItem.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualItem.size}px`,
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <ConversationItem
                    conv={conv}
                    isSelected={selectedId === conv.id}
                    onSelect={onSelect}
                    onDelete={(id) => setDeleteId(id)}
                    formatDate={formatDate}
                    t={t}
                    onPrefetch={prefetchConversation}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          // Rendu standard pour < 50 conversations
          <div className="py-2">
            {filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selectedId === conv.id}
                onSelect={onSelect}
                onDelete={(id) => setDeleteId(id)}
                formatDate={formatDate}
                t={t}
                onPrefetch={prefetchConversation}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog de confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteConfirmMessage')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('deleting') : t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// Composant extrait pour réutilisation avec virtualisation
interface ConversationItemProps {
  conv: Conversation
  isSelected: boolean
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  formatDate: (date: Date) => string
  t: ReturnType<typeof useTranslations>
  onPrefetch?: (id: string) => void
}

const ConversationItem = memo(function ConversationItem({
  conv,
  isSelected,
  onSelect,
  onDelete,
  formatDate,
  t,
  onPrefetch,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors',
        isSelected && 'bg-accent'
      )}
      onClick={() => onSelect(conv.id)}
      onMouseEnter={() => onPrefetch?.(conv.id)}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icons.messageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate text-sm">
            {conv.title || t('newConversation')}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span>{formatDate(conv.lastMessageAt || conv.updatedAt || conv.createdAt || new Date())}</span>
          {conv.dossierNumero && (
            <>
              <span>•</span>
              <span className="truncate">{conv.dossierNumero}</span>
            </>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('deleteConfirmTitle')}
        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(conv.id)
        }}
      >
        <Icons.delete className="h-4 w-4 text-muted-foreground hover:text-destructive" />
      </Button>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison: ne re-render que si la conversation ou son état change
  return (
    prevProps.conv.id === nextProps.conv.id &&
    prevProps.conv.title === nextProps.conv.title &&
    prevProps.conv.dossierNumero === nextProps.conv.dossierNumero &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.conv.lastMessageAt === nextProps.conv.lastMessageAt &&
    prevProps.conv.updatedAt === nextProps.conv.updatedAt
  )
})
