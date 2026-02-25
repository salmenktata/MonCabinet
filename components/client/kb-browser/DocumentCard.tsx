import { Clock, ArrowRight } from 'lucide-react'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { Badge } from '@/components/ui/badge'
import type { SearchResultItem } from './DocumentExplorer'
import { getCategoryLabel } from './kb-browser-utils'
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

// Dot coloré représentant la catégorie (cercle 8px)
const CATEGORY_DOT_COLORS: Record<string, string> = {
  codes: 'bg-indigo-500',
  legislation: 'bg-blue-500',
  constitution: 'bg-violet-600',
  jurisprudence: 'bg-purple-500',
  doctrine: 'bg-green-500',
  modeles: 'bg-orange-500',
  formulaires: 'bg-amber-500',
  conventions: 'bg-teal-500',
  procedures: 'bg-cyan-500',
  jort: 'bg-red-500',
  google_drive: 'bg-yellow-500',
  autre: 'bg-slate-400',
}

function getCategoryDot(category: string): string {
  return CATEGORY_DOT_COLORS[category] || 'bg-slate-400'
}

export function DocumentCard({ document, viewMode, onClick }: DocumentCardProps) {
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const decisionDate = formatDateShort(document.metadata.decisionDate as string | null)
  const updatedAtDate = formatDateShort(document.updatedAt)
  const displayDate = decisionDate || updatedAtDate
  const isAbroge = document.metadata.statut_vigueur === 'abroge'
  const showSimilarity = document.similarity != null && document.similarity < 1 && document.similarity > 0
  const pct = showSimilarity ? Math.round(document.similarity! * 100) : null
  const dotColor = getCategoryDot(document.category)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={`group relative bg-card border rounded-xl p-4 cursor-pointer transition-all duration-150 hover:shadow-md hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === 'grid' ? 'flex flex-col' : 'flex flex-col'}`}
    >
      {/* Top row : catégorie dot + badges + abrogé */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
        <Badge className={`text-xs ${categoryColor || ''}`}>
          {getCategoryLabel(document.category)}
        </Badge>
        {document.normLevel && (
          <Badge className={`text-xs border ${getNormLevelColor(document.normLevel)}`}>
            {getNormLevelLabel(document.normLevel, 'fr')}
          </Badge>
        )}
        {isAbroge && (
          <Badge variant="destructive" className="text-xs ml-auto shrink-0">
            Abrogé
          </Badge>
        )}
      </div>

      {/* Titre */}
      <h3 className={`font-semibold text-sm leading-snug mb-2 group-hover:text-primary transition-colors ${viewMode === 'grid' ? 'line-clamp-3 flex-1' : 'line-clamp-2'}`}>
        {document.title}
      </h3>

      {/* Métadonnées contextuelles (tribunal, décision, citations) */}
      {(document.metadata.tribunalLabelFr || document.metadata.decisionNumber || (document.metadata.citedByCount != null && (document.metadata.citedByCount as number) > 0)) && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {document.metadata.tribunalLabelFr && (
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
              {document.metadata.tribunalLabelFr as string}
            </span>
          )}
          {document.metadata.decisionNumber && (
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
              N° {document.metadata.decisionNumber as string}
            </span>
          )}
          {document.metadata.citedByCount != null && (document.metadata.citedByCount as number) > 0 && (
            <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
              {document.metadata.citedByCount as number} cit.
            </span>
          )}
        </div>
      )}

      {/* Extrait */}
      {document.chunkContent && (
        <p className={`text-xs text-muted-foreground leading-relaxed ${viewMode === 'list' ? 'line-clamp-2' : 'line-clamp-3'}`}>
          {document.chunkContent}
        </p>
      )}

      {/* Barre similarité */}
      {showSimilarity && pct != null && (
        <div className="flex items-center gap-2 mt-2.5">
          <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-muted-foreground/40'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/50">
        {displayDate ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {displayDate}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-primary font-medium flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
          Lire
          <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </div>
  )
}
