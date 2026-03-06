'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useSuggestions } from '@/lib/hooks/useSuggestions'
import { ALL_DOMAINS, DOMAIN_DOT_COLORS, type SuggestionDomain } from '@/lib/data/suggestions'

type ActionType = 'chat' | 'structure' | 'ariida'

interface SuggestionChipsProps {
  mode: ActionType
  onSend: (text: string) => void
  className?: string
}

export function SuggestionChips({ mode, onSend, className }: SuggestionChipsProps) {
  const t = useTranslations('qadhyaIA.domains')
  const [selectedDomain, setSelectedDomain] = useState<SuggestionDomain | 'all'>('all')

  const { suggestions } = useSuggestions({ mode, domain: selectedDomain })

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Domain filter pills */}
      <div className="overflow-x-auto scrollbar-hide px-4">
        <div className="flex gap-1.5 min-w-max">
          <button
            onClick={() => setSelectedDomain('all')}
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors shrink-0',
              selectedDomain === 'all'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
            )}
          >
            {t('all')}
          </button>
          {ALL_DOMAINS.map((domain) => (
            <button
              key={domain}
              onClick={() => setSelectedDomain(domain)}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors shrink-0',
                selectedDomain === domain
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', DOMAIN_DOT_COLORS[domain])} />
              {t(domain as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="overflow-x-auto scrollbar-hide px-4 pb-1">
        <div className="flex gap-2 min-w-max">
          {suggestions.map((chip) => (
            <button
              key={chip.id}
              onClick={() => onSend(chip.send)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium',
                'bg-background hover:bg-accent transition-colors duration-150',
                'text-muted-foreground hover:text-foreground',
                'whitespace-nowrap shrink-0 cursor-pointer'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', DOMAIN_DOT_COLORS[chip.domain])} />
              {chip.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
