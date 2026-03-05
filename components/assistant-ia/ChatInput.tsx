'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import type { ModeConfig } from '@/app/(dashboard)/qadhya-ia/mode-config'

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  isStreaming?: boolean
  disabled?: boolean
  placeholder?: string
  modeConfig?: ModeConfig
  /** Incrémentez cette valeur pour déclencher l'auto-focus du textarea */
  focusKey?: number
  /** ID de la conversation pour le draft auto-save */
  conversationId?: string | null
}

const MAX_CHARS = 4000

export function ChatInput({
  onSend,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder,
  modeConfig,
  focusKey,
  conversationId,
}: ChatInputProps) {
  const t = useTranslations('assistantIA')
  const locale = useLocale()
  const [message, setMessage] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  // Détecter support Speech Recognition
  useEffect(() => {
    setHasSpeechRecognition(!!(
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    ))
  }, [])

  // Restaurer le brouillon quand la conversation change
  useEffect(() => {
    const key = `qadhya_chat_draft_${conversationId || 'new'}`
    const saved = typeof window !== 'undefined' ? localStorage.getItem(key) : null
    setMessage(saved || '')
  }, [conversationId])

  // Sauvegarder le brouillon à chaque frappe
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `qadhya_chat_draft_${conversationId || 'new'}`
    if (message.trim()) {
      localStorage.setItem(key, message)
    } else {
      localStorage.removeItem(key)
    }
  }, [message, conversationId])

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

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = locale === 'ar' ? 'ar-TN' : 'fr-FR'
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      setMessage(prev => prev ? `${prev} ${text}` : text)
    }
    recognition.onend = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }

  const handleSend = () => {
    const trimmed = message.trim()
    if (trimmed && !disabled && !isStreaming) {
      onSend(trimmed)
      setMessage('')
      localStorage.removeItem(`qadhya_chat_draft_${conversationId || 'new'}`)
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
    <div className="p-2 sm:p-3 md:p-4">
      <div className="space-y-2">
        <div className={cn(
          'relative flex items-end gap-2',
          'rounded-2xl border bg-card shadow-sm',
          'focus-within:shadow-md focus-within:border-primary/30',
          'transition-all duration-200',
          isListening && 'border-destructive/40 shadow-destructive/10'
        )}>
          {/* Bouton microphone (voice input) */}
          {hasSpeechRecognition && !isStreaming && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={cn(
                'ps-2 pb-2 self-end shrink-0 flex items-center justify-center h-9 w-9',
                'rounded-xl transition-all duration-200',
                isListening
                  ? 'text-destructive'
                  : 'text-muted-foreground/50 hover:text-foreground'
              )}
              title={isListening ? 'Arrêter l\'écoute' : 'Saisie vocale'}
            >
              {isListening ? (
                <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                  <Icons.mic className="h-4 w-4" />
                </motion.div>
              ) : (
                <Icons.mic className="h-4 w-4" />
              )}
            </button>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isStreaming ? t('generating') : (placeholder || t('placeholder'))}
            disabled={disabled || isStreaming}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent py-3.5',
              hasSpeechRecognition && !isStreaming ? 'px-2' : 'px-4',
              'text-[15px] leading-relaxed placeholder:text-muted-foreground/60',
              'focus:outline-none',
              'min-h-[48px] max-h-[120px] md:max-h-[160px]',
              'disabled:opacity-50'
            )}
          />
          <div className="flex items-center gap-1.5 pe-2 pb-2">
            {/* Compteur de caractères + tokens estimés */}
            {(isNearLimit || charCount > 100) && (
              <>
                <span className={cn(
                  'text-[10px] tabular-nums hidden sm:inline',
                  isOverLimit ? 'text-destructive font-medium' : isNearLimit ? 'text-amber-500' : 'text-muted-foreground/40'
                )}>
                  {charCount}/{MAX_CHARS}
                </span>
                <span className="text-[10px] text-muted-foreground/25 hidden md:inline tabular-nums">
                  ~{Math.ceil(charCount / 4)}t
                </span>
              </>
            )}

            {/* Hint clavier (caché pendant streaming) */}
            {!isStreaming && (
              <span className="hidden sm:inline-flex text-[10px] text-muted-foreground/50 me-1">
                <kbd className="px-1 py-0.5 rounded border border-border/50 bg-muted/30 font-sans">
                  {'\u23CE'}
                </kbd>
              </span>
            )}

            {/* Bouton Stop (animé) ou Envoyer */}
            {isStreaming ? (
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-xl animate-ping bg-destructive/25" />
                <Button
                  onClick={onStop}
                  size="icon"
                  variant="destructive"
                  className="relative h-9 w-9 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95"
                  title={t('stopGeneration')}
                >
                  <div className="h-3 w-3 rounded-sm bg-current" />
                </Button>
              </div>
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
        <p className="hidden sm:block text-[11px] text-muted-foreground/50 text-center mt-2">
          {t('disclaimer')}
        </p>
      </div>
    </div>
  )
}
