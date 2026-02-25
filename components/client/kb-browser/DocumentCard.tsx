import { Clock, ArrowRight } from 'lucide-react'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SearchResultItem } from './DocumentExplorer'
import {
  getCategoryLabel,
  getCategoryBorderColor,
} from './kb-browser-utils'
import { getNormLevelLabel, getNormLevelColor } from '@/lib/categories/norm-levels'

export type ViewMode = 'list' | 'grid'

export interface DocumentCardProps {
  document: SearchResultItem
  viewMode: ViewMode
  onClick: () => void
}

function formatDateShort(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

function getSourceLabel(meta: SearchResultItem['metadata']): string | null {
  const url = meta.source_url as string | null | undefined
  if (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      // fallback
    }
  }
  return (meta.source as string | null | undefined) || null
}

// Barre de progression de similarité (fine, en bas de carte)
function SimilarityBar({ similarity }: { similarity: number }) {
  const pct = Math.round(similarity * 100)
  const colorClass =
    pct >= 80
      ? 'bg-green-500 dark:bg-green-400'
      : pct >= 60
        ? 'bg-yellow-500 dark:bg-yellow-400'
        : 'bg-muted-foreground/40'

  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right shrink-0">
        {pct}%
      </span>
    </div>
  )
}

export function DocumentCard({ document, viewMode, onClick }: DocumentCardProps) {
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const decisionDate = formatDateShort(document.metadata.decisionDate as string | null)
  const updatedAtDate = formatDateShort(document.updatedAt)
  const sourceLabel = getSourceLabel(document.metadata)
  const isAbroge = document.metadata.statut_vigueur === 'abroge'
  const showSimilarity = document.similarity != null && document.similarity < 1 && document.similarity > 0

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-all border-l-4 group ${getCategoryBorderColor(document.category)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-2.5">

          {/* Ligne 1 : Titre + badge abrogé */}
          <div className="flex items-start gap-2 justify-between">
            <h3 className={`font-semibold text-sm leading-snug flex-1 group-hover:text-primary transition-colors ${viewMode === 'grid' ? 'line-clamp-3' : 'line-clamp-2'}`}>
              {document.title}
            </h3>
            {isAbroge && (
              <Badge variant="destructive" className="text-xs shrink-0">
                Abrogé
              </Badge>
            )}
          </div>

          {/* Ligne 2 : Badges catégorie + contexte */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <Badge className={`text-xs ${categoryColor || ''}`}>
              {getCategoryLabel(document.category)}
            </Badge>

            {document.normLevel && (
              <Badge className={`text-xs border ${getNormLevelColor(document.normLevel)}`}>
                {getNormLevelLabel(document.normLevel, 'fr')}
              </Badge>
            )}

            {document.metadata.tribunalLabelFr && (
              <Badge variant="outline" className="text-xs">
                {document.metadata.tribunalLabelFr as string}
              </Badge>
            )}

            {decisionDate && (
              <Badge variant="outline" className="text-xs">
                {decisionDate}
              </Badge>
            )}

            {document.metadata.citedByCount != null && document.metadata.citedByCount > 0 && (
              <Badge variant="outline" className="text-xs opacity-70">
                {document.metadata.citedByCount as number} citations
              </Badge>
            )}
          </div>

          {/* Ligne 3 : Extrait */}
          {document.chunkContent && (
            <p className={`text-sm text-muted-foreground leading-relaxed ${viewMode === 'list' ? 'line-clamp-3' : 'line-clamp-2'}`}>
              {document.chunkContent}
            </p>
          )}

          {/* Barre similarité */}
          {showSimilarity && (
            <SimilarityBar similarity={document.similarity!} />
          )}

          {/* Footer : source / date + bouton Lire */}
          <div className="flex items-center justify-between pt-1 border-t border-muted/40">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {updatedAtDate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {updatedAtDate}
                </span>
              )}
              {sourceLabel && !updatedAtDate && (
                <span className="truncate max-w-[160px]">{sourceLabel}</span>
              )}
            </div>
            <span className="text-xs text-primary font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Lire
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>

        </div>
      </CardContent>
    </Card>
  )
}
