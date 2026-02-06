'use client'

import { useTranslations } from 'next-intl'
import { useState, useRef, useEffect } from 'react'

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
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <label className="block text-lg font-semibold text-foreground mb-4">
        {t('input.label')}
      </label>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={t('input.placeholder')}
        className="w-full min-h-[200px] resize-none rounded-lg border border bg-background p-4 text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        dir="auto"
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span
            className={`text-sm ${
              charCount < minChars
                ? 'text-amber-600'
                : charCount > maxChars
                  ? 'text-red-600'
                  : 'text-muted-foreground'
            }`}
          >
            {charCount.toLocaleString()} / {maxChars.toLocaleString()} {t('input.characters')}
          </span>
          {charCount < minChars && (
            <span className="text-sm text-amber-600">
              ({t('input.minimum', { min: minChars })})
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {t('input.shortcut')}
          </span>
          <button
            onClick={onSubmit}
            disabled={disabled || !isValid}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="h-5 w-5"
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
  )
}
