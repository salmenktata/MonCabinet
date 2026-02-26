'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ModeConfig } from '@/app/(dashboard)/qadhya-ia/mode-config'
import { ALL_DOC_TYPES, DOC_TYPE_TRANSLATIONS, type DocumentType } from '@/lib/categories/doc-types'

interface ChatInputProps {
  onSend: (message: string, options?: { docType?: DocumentType }) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  placeholder?: string
  modeConfig?: ModeConfig
  showDocTypeFilter?: boolean
  /** Incrémentez cette valeur pour déclencher l'auto-focus du textarea */
  focusKey?: number
}

const MAX_CHARS = 4000

const DOC_TYPE_ICONS: Record<DocumentType | 'ALL', string> = {
  ALL: '📚',
  TEXTES: '📕',
  JURIS: '⚖️',
  PROC: '📋',
  TEMPLATES: '📄',
  DOCTRINE: '📖',
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder,
  modeConfig,
  showDocTypeFilter = true,
  focusKey,
}: ChatInputProps) {
  const t = useTranslations('assistantIA')
  const [message, setMessage] = useState('')
  const [selectedDocType, setSelectedDocType] = useState<DocumentType | 'ALL'>('ALL')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const maxHeight = window.innerWidth < 768 ? 120 : 160
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    }
  }, [message])

  // Auto-focus quand focusKey change (nouvelle conversation ou sélection)
  useEffect(() => {
    if (focusKey !== undefined) {
      textareaRef.current?.focus()
    }
  }, [focusKey])

  const handleSend = () => {
    const trimmed = message.trim()
    if (trimmed && !disabled && !isStreaming) {
      const options = selectedDocType !== 'ALL' ? { docType: selectedDocType } : undefined
      onSend(trimmed, options)
      setMessage('')
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const charCount = message.length
  const isNearLimit = charCount > MAX_CHARS * 0.8
  const isOverLimit = charCount > MAX_CHARS
  const canSend = message.trim().length > 0 && !disabled && !isStreaming && !isOverLimit

  return (
    <div className="p-3 md:p-4">
      <div className="space-y-2">
        {/* Filtre doc_type */}
        {showDocTypeFilter && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">{t('searchIn')}</span>
            <Select value={selectedDocType} onValueChange={(v) => setSelectedDocType(v as DocumentType | 'ALL')}>
              <SelectTrigger className="h-7 w-auto min-w-[180px] text-xs">
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    {DOC_TYPE_ICONS[selectedDocType]}
                    {selectedDocType === 'ALL' ? t('allTypes') : DOC_TYPE_TRANSLATIONS[selectedDocType as DocumentType].fr}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">
                  <span className="flex items-center gap-2">
                    {DOC_TYPE_ICONS.ALL} {t('allTypes')}
                  </span>
                </SelectItem>
                {ALL_DOC_TYPES.map((docType) => (
                  <SelectItem key={docType} value={docType}>
                    <span className="flex items-center gap-2">
                      {DOC_TYPE_ICONS[docType]} {DOC_TYPE_TRANSLATIONS[docType].fr}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className={cn(
          'relative flex items-end gap-2',
          'rounded-2xl border bg-card shadow-sm',
          'focus-within:shadow-md focus-within:border-primary/30',
          'transition-all duration-200'
        )}>
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? t('generating') : (placeholder || t('placeholder'))}
            disabled={disabled || isStreaming}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent px-4 py-3.5',
              'text-[15px] leading-relaxed placeholder:text-muted-foreground/60',
              'focus:outline-none',
              'min-h-[48px] max-h-[120px] md:max-h-[160px]',
              'disabled:opacity-50'
            )}
          />
          <div className="flex items-center gap-1.5 pe-2 pb-2">
            {/* Compteur de caractères */}
            {(isNearLimit || charCount > 100) && (
              <span className={cn(
                'text-[10px] tabular-nums hidden sm:inline',
                isOverLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground/40'
              )}>
                {charCount}/{MAX_CHARS}
              </span>
            )}

            {/* Hint clavier (caché pendant streaming) */}
            {!isStreaming && (
              <span className="hidden sm:inline-flex text-[10px] text-muted-foreground/50 me-1">
                <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted/30 font-sans">
                  {'\u23CE'}
                </kbd>
              </span>
            )}

            {/* Bouton Stop ou Envoyer */}
            {isStreaming ? (
              <Button
                onClick={onStop}
                size="icon"
                variant="destructive"
                className="h-9 w-9 rounded-xl shrink-0 transition-all duration-200 hover:scale-105 active:scale-95"
                title={t('stopGeneration')}
              >
                <Icons.x className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSend}
                disabled={!canSend}
                size="icon"
                className={cn(
                  'h-9 w-9 rounded-xl shrink-0',
                  'transition-all duration-200',
                  canSend && 'hover:scale-105 active:scale-95 shadow-sm',
                  !canSend && 'opacity-40'
                )}
              >
                {disabled ? (
                  <Icons.loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.arrowUp className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground/50 text-center mt-2">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  )
}
