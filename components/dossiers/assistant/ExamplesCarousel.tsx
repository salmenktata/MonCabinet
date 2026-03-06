'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { getSuggestions, ALL_DOMAINS, DOMAIN_COLORS, DOMAIN_DOT_COLORS, type SuggestionDomain } from '@/lib/data/suggestions'

interface ExamplesCarouselProps {
  onSelect: (example: string) => void
}

export default function ExamplesCarousel({ onSelect }: ExamplesCarouselProps) {
  const t = useTranslations('assistant')
  const tDomains = useTranslations('qadhyaIA.domains')
  const [selectedDomain, setSelectedDomain] = useState<SuggestionDomain | 'all'>('all')

  const suggestions =
    selectedDomain === 'all'
      ? getSuggestions('structure')
      : getSuggestions('structure', selectedDomain)

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">{t('examples.title')}</p>

      {/* Domain filter pills */}
      <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
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
            {tDomains('all')}
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
              {tDomains(domain as Parameters<typeof tDomains>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Example pills */}
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => onSelect(suggestion.send)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-sm font-medium text-foreground',
              'hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2'
            )}
          >
            <span className={cn('h-2 w-2 rounded-full shrink-0', DOMAIN_DOT_COLORS[suggestion.domain])} />
            <span className={cn(
              'text-[10px] font-semibold px-1.5 py-0 rounded border shrink-0',
              DOMAIN_COLORS[suggestion.domain]
            )}>
              {tDomains(suggestion.domain as Parameters<typeof tDomains>[0])}
            </span>
            {suggestion.label}
          </button>
        ))}
      </div>
    </div>
  )
}
