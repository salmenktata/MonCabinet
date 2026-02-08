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
}

type SortOption = 'relevance' | 'name'

export function SourcesPanel({ sources, className, onViewDocument }: SourcesPanelProps) {
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
    <div className={cn('mt-3 border rounded-lg overflow-hidden', className)}>
      {/* Header collapsible */}
      <button
        className={cn(
          'w-full flex items-center justify-between px-4 py-3',
          'bg-muted/50 hover:bg-muted/80 transition-colors',
          'text-left'
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Icons.fileSearch className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">
            Sources consultées
          </span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {sources.length}
          </span>
        </div>

        <Icons.chevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Contenu expandable */}
      {isExpanded && (
        <div className="p-4 space-y-4 animate-fade-in">
          {/* Filtres et tri */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <SourceTypeFilter
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              counts={counts}
            />

            {/* Options de tri */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Trier par:</span>
              <Button
                variant={sortBy === 'relevance' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy('relevance')}
              >
                <Icons.arrowUpDown className="h-3 w-3 mr-1" />
                Pertinence
              </Button>
              <Button
                variant={sortBy === 'name' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSortBy('name')}
              >
                <Icons.sortAsc className="h-3 w-3 mr-1" />
                Nom
              </Button>
            </div>
          </div>

          {/* Liste des sources */}
          <div className="space-y-3">
            {filteredSources.map((source, index) => (
              <SourceCard
                key={`${source.documentId}-${index}`}
                source={source}
                index={sources.indexOf(source)}
                onViewDocument={onViewDocument}
              />
            ))}

            {filteredSources.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Aucune source de ce type
              </div>
            )}
          </div>

          {/* Statistiques résumées */}
          <div className="pt-3 border-t">
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Icons.checkCircle className="h-3 w-3 text-green-500" />
                Score moyen: {Math.round(sources.reduce((acc, s) => acc + s.similarity, 0) / sources.length * 100)}%
              </div>
              <div className="flex items-center gap-1">
                <Icons.fileText className="h-3 w-3" />
                {counts.document} document{counts.document > 1 ? 's' : ''}
              </div>
              {counts.jurisprudence > 0 && (
                <div className="flex items-center gap-1">
                  <Icons.scale className="h-3 w-3" />
                  {counts.jurisprudence} jurisprudence{counts.jurisprudence > 1 ? 's' : ''}
                </div>
              )}
              {counts.knowledge_base > 0 && (
                <div className="flex items-center gap-1">
                  <Icons.bookOpen className="h-3 w-3" />
                  {counts.knowledge_base} article{counts.knowledge_base > 1 ? 's' : ''} KB
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
