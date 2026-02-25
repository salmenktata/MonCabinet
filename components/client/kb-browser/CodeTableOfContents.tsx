'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, List } from 'lucide-react'
import { Button } from '@/components/ui/button'

// =============================================================================
// TYPES
// =============================================================================

export type TocLevel = 'livre' | 'titre' | 'chapitre' | 'section' | 'article'

export interface TocEntry {
  label: string
  chunkIndex: number
  level: TocLevel
}

interface CodeTableOfContentsProps {
  entries: TocEntry[]
  activeChunkIndex?: number
  onNavigate: (chunkIndex: number) => void
  className?: string
}

// =============================================================================
// STYLES PAR NIVEAU
// =============================================================================

const LEVEL_INDENT: Record<TocLevel, string> = {
  livre: '',
  titre: 'pl-3',
  chapitre: 'pl-5',
  section: 'pl-7',
  article: 'pl-8',
}

const LEVEL_FONT: Record<TocLevel, string> = {
  livre: 'font-bold text-sm',
  titre: 'font-semibold text-sm',
  chapitre: 'font-medium text-sm',
  section: 'text-sm',
  article: 'text-xs text-muted-foreground',
}

const LEVEL_ICON: Record<TocLevel, React.ReactNode> = {
  livre: <span className="text-[10px] font-bold text-indigo-500 uppercase">L</span>,
  titre: <span className="text-[10px] font-bold text-blue-500 uppercase">T</span>,
  chapitre: <span className="text-[10px] font-bold text-cyan-500 uppercase">C</span>,
  section: <span className="text-[10px] font-bold text-teal-500 uppercase">S</span>,
  article: null,
}

// Niveaux qu'on affiche dans la TOC (par défaut : masquer les articles si trop nombreux)
const ALWAYS_SHOWN_LEVELS: TocLevel[] = ['livre', 'titre', 'chapitre', 'section']

// =============================================================================
// PARSER
// =============================================================================

const HEADING_PATTERNS: Array<{ regex: RegExp; level: TocLevel }> = [
  { regex: /^(LIVRE\s+\w+|كتاب\s+\w+)/i, level: 'livre' },
  { regex: /^(TITRE\s+\w+|عنوان\s+\w+|الباب\s+\w+)/i, level: 'titre' },
  { regex: /^(CHAPITRE\s+\w+|CHAPTER\s+\w+|الفصل\s+(?!ال?\d)|الفرع\s+\w+)/i, level: 'chapitre' },
  { regex: /^(SECTION\s+\w+|القسم\s+\w+)/i, level: 'section' },
  { regex: /^(Article\s+\d+|Art\.\s*\d+|الفصل\s+\d+|فصل\s+\d+)/i, level: 'article' },
]

export function parseChunksToToc(chunks: { index: number; content: string }[]): TocEntry[] {
  const entries: TocEntry[] = []
  for (const chunk of chunks) {
    const firstLine = chunk.content.trim().split('\n')[0].trim()
    for (const { regex, level } of HEADING_PATTERNS) {
      if (regex.test(firstLine)) {
        entries.push({
          label: firstLine.slice(0, 80),
          chunkIndex: chunk.index,
          level,
        })
        break
      }
    }
  }
  return entries
}

// =============================================================================
// COMPOSANT
// =============================================================================

export function CodeTableOfContents({
  entries,
  activeChunkIndex,
  onNavigate,
  className = '',
}: CodeTableOfContentsProps) {
  const [showArticles, setShowArticles] = useState(false)

  const articleCount = entries.filter((e) => e.level === 'article').length
  const hasArticles = articleCount > 0

  const visibleEntries = showArticles
    ? entries
    : entries.filter((e) => ALWAYS_SHOWN_LEVELS.includes(e.level))

  if (entries.length === 0) return null

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
        <List className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Table des matières
        </span>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-1 space-y-0.5">
        {visibleEntries.map((entry, i) => {
          const isActive = entry.chunkIndex === activeChunkIndex
          const icon = LEVEL_ICON[entry.level]

          return (
            <button
              key={i}
              onClick={() => onNavigate(entry.chunkIndex)}
              className={`
                w-full text-left px-2 py-1.5 rounded transition-colors flex items-start gap-1.5
                ${LEVEL_INDENT[entry.level]}
                ${LEVEL_FONT[entry.level]}
                ${isActive
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted text-foreground/80 hover:text-foreground'
                }
              `}
            >
              {icon && (
                <span className="shrink-0 mt-0.5 w-3">{icon}</span>
              )}
              <span className="line-clamp-2 leading-snug">{entry.label}</span>
              {isActive && (
                <ChevronRight className="h-3 w-3 ml-auto shrink-0 mt-0.5 text-primary" />
              )}
            </button>
          )
        })}
      </div>

      {hasArticles && (
        <div className="border-t px-3 py-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs h-7 gap-1"
            onClick={() => setShowArticles(!showArticles)}
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showArticles ? 'rotate-180' : ''}`} />
            {showArticles ? 'Masquer les articles' : `Afficher ${articleCount} articles`}
          </Button>
        </div>
      )}
    </div>
  )
}
