'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ChatActionsProps {
  hasMessages: boolean
  conversationId: string | null
  onCreateDossier?: () => void
}

export function ChatActions({ hasMessages, conversationId, onCreateDossier }: ChatActionsProps) {
  const t = useTranslations('assistantIA')

  if (!hasMessages) return null

  return (
    <div className="border-t bg-muted/30 px-4 py-3">
      <div className="flex items-center gap-2 max-w-4xl mx-auto">
        <span className="text-xs text-muted-foreground mr-2">{t('actions')}:</span>

        <Button variant="outline" size="sm" onClick={onCreateDossier}>
          <Icons.add className="h-4 w-4 mr-2" />
          {t('createDossier')}
        </Button>

        <Link href="/dossiers/assistant">
          <Button variant="outline" size="sm">
            <Icons.zap className="h-4 w-4 mr-2" />
            {t('quickMode')}
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <Icons.moreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <Icons.bookOpen className="h-4 w-4 mr-2" />
              {t('viewReferences')}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icons.copy className="h-4 w-4 mr-2" />
              {t('copyConversation')}
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Icons.download className="h-4 w-4 mr-2" />
              {t('exportConversation')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
