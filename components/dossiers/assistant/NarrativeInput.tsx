'use client'

import { useTranslations } from 'next-intl'
import { useState, useRef, useEffect } from 'react'
import { ProgressiveFeedback } from './ProgressiveFeedback'

interface NarrativeInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled: boolean
}

export default function NarrativeInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: NarrativeInputProps) {
  const t = useTranslations('assistant')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [charCount, setCharCount] = useState(0)

  const maxChars = 10000
  const minChars = 20

  useEffect(() => {
    setCharCount(value.length)
  }, [value])

  // Auto-resize du textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 400)}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (charCount >= minChars) {
        onSubmit()
      }
    }
  }

  const isValid = charCount >= minChars && charCount <= maxChars

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Colonne 1 : Saisie du narratif */}
        <div className="rounded-xl border bg-card p-5 shadow-sm flex flex-col gap-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={t('input.placeholder')}
            className="w-full min-h-[300px] resize-none rounded-lg border bg-background p-4 text-foreground placeholder:text-muted-foreground focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            dir="auto"
          />

          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-xs tabular-nums ${
                charCount < minChars
                  ? 'text-amber-600 dark:text-amber-400'
                  : charCount > maxChars
                    ? 'text-red-600'
                    : 'text-muted-foreground'
              }`}
            >
              {charCount.toLocaleString()} / {maxChars.toLocaleString()}
              {charCount < minChars && (
                <span className="ml-1 opacity-70">
                  ({t('input.minimum', { min: minChars })})
                </span>
              )}
            </span>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {t('input.shortcut')}
              </span>
              <button
                onClick={onSubmit}
                disabled={disabled || !isValid}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-sm text-white font-semibold hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {t('input.analyzeButton')}
              </button>
            </div>
          </div>
        </div>

        {/* Colonne 2 : Feedback progressif */}
        <ProgressiveFeedback text={value} realtime={true} />
      </div>
    </div>
  )
}
