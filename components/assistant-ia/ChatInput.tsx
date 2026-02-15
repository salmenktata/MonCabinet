'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ModeConfig } from '@/app/(dashboard)/qadhya-ia/mode-config'

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  modeConfig?: ModeConfig
}

export function ChatInput({ onSend, disabled = false, placeholder, modeConfig }: ChatInputProps) {
  const t = useTranslations('assistantIA')
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea avec max-height responsive
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const maxHeight = window.innerWidth < 768 ? 150 : 200
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    }
  }, [message])

  const handleSend = () => {
    const trimmed = message.trim()
    if (trimmed && !disabled) {
      onSend(trimmed)
      setMessage('')
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Entrée sans Shift = envoyer
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    // Ctrl/Cmd + Entrée = envoyer aussi
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const canSend = message.trim().length > 0 && !disabled

  return (
    <div className="border-t bg-background p-4">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || t('placeholder')}
            disabled={disabled}
            className={cn(
              'min-h-[52px] max-h-[200px] md:max-h-[200px] resize-none pr-12',
              'focus-visible:ring-2 focus-visible:ring-offset-2',
              modeConfig?.ringClass || 'focus-visible:ring-primary',
              'transition-all duration-200'
            )}
            rows={1}
          />
          <div className="absolute right-2 bottom-2 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">
              {t('enterToSend')}
            </kbd>
          </div>
        </div>
        <Button
          onClick={handleSend}
          disabled={!canSend}
          size="icon"
          aria-label={t('enterToSend')}
          className={cn(
            'h-[52px] w-[52px] shrink-0',
            'transition-all duration-200 ease-out',
            'hover:shadow-lg hover:scale-[1.02]',
            'active:scale-[0.98]'
          )}
        >
          {disabled ? (
            <Icons.loader className="h-5 w-5 animate-spin" />
          ) : (
            <Icons.arrowUp className="h-5 w-5" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-2">
        {t('disclaimer')}
      </p>
    </div>
  )
}
