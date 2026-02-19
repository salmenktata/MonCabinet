'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { ChatMessage } from './ChatMessages'
import { copyToClipboard, downloadExport, type ExportFormat } from '@/lib/export/conversation-exporter'

interface ChatActionsProps {
  hasMessages: boolean
  conversationId: string | null
  messages?: ChatMessage[]
  conversationTitle?: string
  onCreateDossier?: () => void
}

export function ChatActions({
  hasMessages,
  conversationId,
  messages = [],
  conversationTitle,
  onCreateDossier,
}: ChatActionsProps) {
  const t = useTranslations('assistantIA')
  const [isExporting, setIsExporting] = useState(false)

  if (!hasMessages) return null

  // Préparer les données de conversation pour l'export
  const conversationData = {
    id: conversationId || 'temp-' + Date.now(),
    title: conversationTitle,
    messages,
    createdAt: messages[0]?.createdAt,
    updatedAt: messages[messages.length - 1]?.createdAt,
  }

  // Handler pour copier dans le presse-papiers
  const handleCopy = async (format: 'text' | 'markdown' = 'text') => {
    const success = await copyToClipboard(conversationData, format)
    if (success) {
      toast.success('Copié! — La conversation a été copiée dans le presse-papiers.')
    } else {
      toast.error('Impossible de copier la conversation.')
    }
  }

  // Handler pour exporter (côté client)
  const handleExportClient = (format: ExportFormat) => {
    try {
      downloadExport(conversationData, {
        format,
        includeSources: true,
        includeMetadata: true,
        locale: 'fr',
      })
      toast.success(`Conversation exportée au format ${format.toUpperCase()}.`)
    } catch (error) {
      toast.error('Impossible d\'exporter la conversation.')
    }
  }

  // Handler pour exporter (côté serveur - avec conversationId)
  const handleExportServer = async (format: ExportFormat) => {
    if (!conversationId) {
      handleExportClient(format)
      return
    }

    setIsExporting(true)
    try {
      const response = await fetch(
        `/api/chat/${conversationId}/export?format=${format}&includeSources=true`
      )

      if (!response.ok) {
        throw new Error('Erreur lors de l\'export')
      }

      // Télécharger le fichier
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const filename =
        response.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ||
        `qadhya-chat.${format}`

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`Conversation exportée au format ${format.toUpperCase()}.`)
    } catch (error) {
      console.error('Erreur export:', error)
      toast.error('Impossible d\'exporter la conversation.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="border-t bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 px-4 md:px-8">
        <span className="text-xs text-muted-foreground mr-2">{t('actions')}:</span>

        <Button variant="outline" size="sm" onClick={onCreateDossier}>
          <Icons.add className="h-4 w-4 mr-2" />
          {t('createDossier')}
        </Button>

        <Link href="/qadhya-ia/structure">
          <Button variant="outline" size="sm">
            <Icons.zap className="h-4 w-4 mr-2" />
            {t('quickMode')}
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isExporting}>
              {isExporting ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.moreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Copier */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icons.copy className="h-4 w-4 mr-2" />
                {t('copyConversation')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleCopy('text')}>
                  <Icons.fileText className="h-4 w-4 mr-2" />
                  Texte simple
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleCopy('markdown')}>
                  <Icons.code className="h-4 w-4 mr-2" />
                  Markdown
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            {/* Exporter */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Icons.download className="h-4 w-4 mr-2" />
                {t('exportConversation')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onClick={() => handleExportServer('markdown')}>
                  <Icons.code className="h-4 w-4 mr-2" />
                  Markdown (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportServer('json')}>
                  <Icons.database className="h-4 w-4 mr-2" />
                  JSON (.json)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExportServer('text')}>
                  <Icons.fileText className="h-4 w-4 mr-2" />
                  Texte (.txt)
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuItem>
              <Icons.bookOpen className="h-4 w-4 mr-2" />
              {t('viewReferences')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
