'use client'

import { useState, useRef, useLayoutEffect, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { ChatSource } from './ChatMessages'

interface InlineCitationProps {
  citationNumber: string // ex: "1", "KB-2", "Juris-1"
  source?: ChatSource
  className?: string
}

export function InlineCitation({ citationNumber, source, className }: InlineCitationProps) {
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({})

  const adjustPopoverPosition = useCallback(() => {
    const el = popoverRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const padding = 8
    let offsetX = 0
    if (rect.right > window.innerWidth - padding) {
      offsetX = window.innerWidth - padding - rect.right
    } else if (rect.left < padding) {
      offsetX = padding - rect.left
    }
    if (offsetX !== 0) {
      setPopoverStyle({ transform: `translateX(calc(-50% + ${offsetX}px))` })
    } else {
      setPopoverStyle({})
    }
  }, [])

  useLayoutEffect(() => {
    if (showPopover) {
      adjustPopoverPosition()
    } else {
      setPopoverStyle({})
    }
  }, [showPopover, adjustPopoverPosition])

  // Fallback gracieux : badge désactivé si source undefined
  if (!source) {
    return (
      <Badge variant="outline" className={cn(
        'inline-flex items-center gap-1 text-xs mx-0.5 align-super opacity-50 cursor-default',
        className
      )}>
        {citationNumber}
      </Badge>
    )
  }

  // Déterminer le type de citation
  const getCitationType = () => {
    if (citationNumber.startsWith('KB-')) return 'knowledge_base'
    if (citationNumber.startsWith('Juris-')) return 'jurisprudence'
    return 'document'
  }

  const citationType = getCitationType()

  // Icône selon le type
  const getIcon = () => {
    switch (citationType) {
      case 'knowledge_base':
        return <Icons.bookOpen className="h-3 w-3" />
      case 'jurisprudence':
        return <Icons.scale className="h-3 w-3" />
      default:
        return <Icons.fileText className="h-3 w-3" />
    }
  }

  // Couleur selon le type
  const getVariant = () => {
    switch (citationType) {
      case 'knowledge_base':
        return 'default' // bleu
      case 'jurisprudence':
        return 'secondary' // gris
      default:
        return 'outline' // bordure
    }
  }

  return (
    <span className="relative inline-block">
      <Badge
        variant={getVariant()}
        className={cn(
          'inline-flex items-center gap-1 text-xs cursor-help mx-0.5 align-super',
          'transition-all hover:scale-110',
          className
        )}
        onMouseEnter={() => setShowPopover(true)}
        onMouseLeave={() => setShowPopover(false)}
      >
        {getIcon()}
        {citationNumber}
      </Badge>

      {/* Popover avec détails de la source */}
      {showPopover && source && (
        <div
          ref={popoverRef}
          className={cn(
            'absolute bottom-full left-1/2 mb-2 z-50',
            'w-80 max-w-[90vw]',
            'bg-popover border rounded-lg shadow-lg p-4',
            'text-popover-foreground',
            'animate-scale-in'
          )}
          style={{ transform: popoverStyle.transform || 'translateX(-50%)' }}
          onMouseEnter={() => setShowPopover(true)}
          onMouseLeave={() => setShowPopover(false)}
        >
          {/* Titre de la source */}
          <div className="flex items-start gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {getIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">
                {source.documentName}
              </p>
              {typeof source.metadata?.type === 'string' && source.metadata.type && (
                <p className="text-xs text-muted-foreground">
                  {source.metadata.type}
                </p>
              )}
            </div>
          </div>

          {/* Extrait du contenu */}
          <div className="mb-3">
            <p className="text-xs text-muted-foreground line-clamp-4 leading-relaxed">
              {source.chunkContent}
            </p>
          </div>

          {/* Métadonnées */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Pertinence:</span>
              <span className="font-semibold text-primary">
                {(source.similarity * 100).toFixed(0)}%
              </span>
            </div>

            {typeof source.metadata?.chunkPosition === 'number' && (
              <span className="text-muted-foreground">
                Chunk {source.metadata.chunkPosition}
              </span>
            )}
          </div>

          {/* Date et juridiction si disponibles */}
          {(typeof source.metadata?.date === 'string' || typeof source.metadata?.juridiction === 'string') && (
            <div className="mt-2 pt-2 border-t flex flex-wrap gap-2 text-xs">
              {typeof source.metadata?.date === 'string' && source.metadata.date && (
                <span className="text-muted-foreground">
                  {source.metadata.date}
                </span>
              )}
              {typeof source.metadata?.juridiction === 'string' && source.metadata.juridiction && (
                <span className="text-muted-foreground">
                  {source.metadata.juridiction}
                </span>
              )}
            </div>
          )}

          {/* Flèche du popover */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-border" />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-[7px] w-0 h-0 border-l-[7px] border-r-[7px] border-t-[7px] border-transparent border-t-popover" />
          </div>
        </div>
      )}
    </span>
  )
}

/**
 * Parse le contenu du message et remplace les citations [Source N], [KB-N], [Juris-N]
 * par des composants InlineCitation
 */
export function parseCitationsInContent(
  content: string,
  sources: ChatSource[]
): React.ReactNode[] {
  // Pattern pour matcher [Source N], [KB-N], [Juris-N]
  const citationPattern = /\[(Source|KB|Juris)-?(\d+)\]/g

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = citationPattern.exec(content)) !== null) {
    const fullMatch = match[0] // ex: "[Source 1]"
    const citationType = match[1] // ex: "Source"
    const citationNum = match[2] // ex: "1"
    const citationKey = `${citationType}-${citationNum}` // ex: "Source-1"

    // Ajouter le texte avant la citation
    if (match.index > lastIndex) {
      parts.push(content.substring(lastIndex, match.index))
    }

    // Trouver la source correspondante
    const sourceIndex = parseInt(citationNum, 10) - 1
    const source = sources[sourceIndex]

    // Ajouter le composant de citation
    parts.push(
      <InlineCitation
        key={`citation-${match.index}`}
        citationNumber={citationKey}
        source={source}
      />
    )

    lastIndex = match.index + fullMatch.length
  }

  // Ajouter le texte restant
  if (lastIndex < content.length) {
    parts.push(content.substring(lastIndex))
  }

  return parts.length > 0 ? parts : [content]
}
