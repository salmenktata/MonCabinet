'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Icons } from '@/lib/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ChatSource } from './ChatMessages'

interface SourceCardProps {
  source: ChatSource
  index: number
  onViewDocument?: (documentId: string) => void
}

export function SourceCard({ source, index, onViewDocument }: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Déterminer le type de source
  const getSourceType = () => {
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

  const sourceType = getSourceType()

  // Icône et couleur selon le type
  const getTypeConfig = () => {
    switch (sourceType) {
      case 'jurisprudence':
        return {
          icon: <Icons.scale className="h-4 w-4" />,
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-100 dark:bg-amber-900/30',
          label: 'Jurisprudence',
        }
      case 'knowledge_base':
        return {
          icon: <Icons.bookOpen className="h-4 w-4" />,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-100 dark:bg-blue-900/30',
          label: 'Base de connaissances',
        }
      default:
        return {
          icon: <Icons.fileText className="h-4 w-4" />,
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-100 dark:bg-gray-800',
          label: 'Document',
        }
    }
  }

  const typeConfig = getTypeConfig()
  const similarityPercent = Math.round(source.similarity * 100)

  // Couleur de la barre de progression selon le score
  const getProgressColor = () => {
    if (similarityPercent >= 90) return 'bg-green-500'
    if (similarityPercent >= 70) return 'bg-blue-500'
    if (similarityPercent >= 60) return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  return (
    <div
      className={cn(
        'rounded-lg border p-4 transition-all',
        'hover:shadow-md hover:border-primary/30',
        isExpanded && 'ring-1 ring-primary/20'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Numéro et icône type */}
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
            typeConfig.bgColor,
            typeConfig.color
          )}
        >
          {typeConfig.icon}
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="font-medium text-sm truncate" title={source.documentName}>
                {source.documentName}
              </h4>
              <Badge variant="secondary" className="text-xs mt-1">
                {typeConfig.label}
              </Badge>
            </div>

            {/* Badge numéro de source */}
            <Badge variant="outline" className="shrink-0">
              Source {index + 1}
            </Badge>
          </div>

          {/* Barre de pertinence */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Pertinence</span>
              <span className="font-semibold">{similarityPercent}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', getProgressColor())}
                style={{ width: `${similarityPercent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Extrait */}
      <div className="mt-4">
        <p
          className={cn(
            'text-sm text-muted-foreground leading-relaxed',
            !isExpanded && 'line-clamp-3'
          )}
        >
          {source.chunkContent}
        </p>

        {source.chunkContent.length > 200 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-auto p-0 text-xs text-primary hover:text-primary/80"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                <Icons.chevronUp className="h-3 w-3 mr-1" />
                Réduire
              </>
            ) : (
              <>
                <Icons.chevronDown className="h-3 w-3 mr-1" />
                Voir plus
              </>
            )}
          </Button>
        )}
      </div>

      {/* Métadonnées */}
      {source.metadata && (() => {
        const metadata = source.metadata as Record<string, unknown>
        const chunkPos = metadata.chunkPosition
        const date = metadata.date
        const juridiction = metadata.juridiction
        const hasMetadata = chunkPos !== undefined || date || juridiction

        if (!hasMetadata) return null

        return (
          <div className="mt-4 pt-3 border-t flex flex-wrap gap-2 text-xs">
            {typeof chunkPos === 'number' && (
              <span className="text-muted-foreground flex items-center gap-1">
                <Icons.layers className="h-3 w-3" />
                Chunk {chunkPos}
              </span>
            )}
            {typeof date === 'string' && date && (
              <span className="text-muted-foreground flex items-center gap-1">
                <Icons.calendar className="h-3 w-3" />
                {date}
              </span>
            )}
            {typeof juridiction === 'string' && juridiction && (
              <span className="text-muted-foreground flex items-center gap-1">
                <Icons.scale className="h-3 w-3" />
                {juridiction}
              </span>
            )}
          </div>
        )
      })()}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        {onViewDocument && (
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => onViewDocument(source.documentId)}
          >
            <Icons.externalLink className="h-3 w-3 mr-1" />
            Voir le document
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="text-xs ml-auto"
          onClick={() => {
            navigator.clipboard.writeText(source.chunkContent)
          }}
        >
          <Icons.copy className="h-3 w-3 mr-1" />
          Copier
        </Button>
      </div>
    </div>
  )
}
