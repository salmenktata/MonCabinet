'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { SourceCard } from './SourceCard'
import { SourceTypeFilter, type SourceType } from './SourceTypeFilter'
import type { ChatSource } from './ChatMessages'

interface SourcesPanelProps {
  sources: ChatSource[]
  className?: string
  onViewDocument?: (documentId: string) => void
  qualityIndicator?: 'high' | 'medium' | 'low'
}

type SortOption = 'relevance' | 'name'

export function SourcesPanel({ sources, className, onViewDocument, qualityIndicator }: SourcesPanelProps) {
  const t = useTranslations('assistantIA')
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeFilter, setActiveFilter] = useState<SourceType>('all')
  const [sortBy, setSortBy] = useState<SortOption>('relevance')

  // Classifier les sources par type
  const getSourceType = (source: ChatSource): SourceType => {
    const metadata = source.metadata as Record<string, unknown> | undefined
    const type = metadata?.type as string | undefined
    if (type) {
      if (type.includes('juris') || type.includes('arret') || type.includes('decision')) {
        return 'jurisprudence'
      }
      if (type.includes('kb') || type.includes('knowledge') || type.includes('base')) {
        return 'knowledge_base'
      }
    }
    return 'document'
  }

  // Compter les sources par type
  const counts = useMemo(() => {
    const result = { all: sources.length, document: 0, jurisprudence: 0, knowledge_base: 0 }
    sources.forEach((source) => {
      const type = getSourceType(source)
      result[type]++
    })
    return result
  }, [sources])

  // Filtrer et trier les sources
  const filteredSources = useMemo(() => {
    let result = [...sources]

    // Filtrer par type
    if (activeFilter !== 'all') {
      result = result.filter((source) => getSourceType(source) === activeFilter)
    }

    // Trier
    result.sort((a, b) => {
      if (sortBy === 'relevance') {
        return b.similarity - a.similarity
      }
      return a.documentName.localeCompare(b.documentName)
    })

    return result
  }, [sources, activeFilter, sortBy])

  if (sources.length === 0) return null

  return (
    <div className={cn('mt-2 rounded-xl border border-border/40 overflow-hidden bg-muted/20', className)}>
      {/* Header collapsible */}
      <button
        className={cn(
          'w-full flex items-center justify-between px-3.5 py-2.5',
          'hover:bg-muted/40 transition-colors',
          'text-left'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icons.fileSearch className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-medium text-xs text-muted-foreground">
            Sources consultées
          </span>
          <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold tabular-nums">
            {sources.length}
          </span>
          {qualityIndicator === 'low' && (
            <span className="px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive text-[11px] font-medium">
              Faible
            </span>
          )}
          {qualityIndicator === 'medium' && (
            <span className="px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-[11px] font-medium">
              Moyenne
            </span>
          )}
        </div>

        <Icons.chevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Contenu expandable */}
      {isExpanded && (
        <div className="px-3.5 pb-3 pt-1 space-y-3 animate-fade-in">
          {/* Filtres et tri */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <SourceTypeFilter
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
            />

            {/* Options de tri */}
            <div className="flex items-center gap-1">
              <Button
                variant={sortBy === 'relevance' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-[11px] px-2 rounded-md"
                onClick={() => setSortBy('relevance')}
              >
                <Icons.arrowUpDown className="h-2.5 w-2.5 mr-1" />
                Pertinence
              </Button>
              <Button
                variant={sortBy === 'name' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-6 text-[11px] px-2 rounded-md"
                onClick={() => setSortBy('name')}
              >
                <Icons.sortAsc className="h-2.5 w-2.5 mr-1" />
                Nom
              </Button>
            </div>
          </div>

          {/* Liste des sources */}
          <div className="space-y-2">
            {filteredSources.map((source, index) => (
              <SourceCard
                key={`${source.documentId}-${index}`}
                source={source}
                index={sources.indexOf(source)}
                onViewDocument={onViewDocument}
              />
            ))}

            {filteredSources.length === 0 && (
              <div className="text-center py-4 text-muted-foreground text-xs">
                Aucune source de ce type
              </div>
            )}
          </div>

          {/* Statistiques résumées */}
          <div className="pt-2 border-t border-border/30">
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground/70">
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Score moyen: {Math.round(sources.reduce((acc, s) => acc + s.similarity, 0) / sources.length * 100)}%
              </div>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {counts.document} doc{counts.document > 1 ? 's' : ''}
              </div>
              {counts.jurisprudence > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  {counts.jurisprudence} juris.
                </div>
              )}
              {counts.knowledge_base > 0 && (
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  {counts.knowledge_base} KB
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
