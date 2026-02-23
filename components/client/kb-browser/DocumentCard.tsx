import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { SearchResultItem } from './DocumentExplorer'
import {
  formatDate,
  getCategoryLabel,
  getCategoryBorderColor,
  getSimilarityColor,
} from './kb-browser-utils'
import { getNormLevelLabel, getNormLevelColor } from '@/lib/categories/norm-levels'

export type ViewMode = 'list' | 'grid'

export interface DocumentCardProps {
  document: SearchResultItem
  viewMode: ViewMode
  onClick: () => void
}

export function DocumentCard({ document, viewMode, onClick }: DocumentCardProps) {
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const formattedDate = formatDate(document.metadata.decisionDate as string | null)

  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${getCategoryBorderColor(document.category)}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm line-clamp-2 flex-1">
              {document.title}
            </h3>
            {document.similarity != null && document.similarity < 1 && (
              <Badge variant="outline" className={`shrink-0 ${getSimilarityColor(document.similarity)}`}>
                {Math.round(document.similarity * 100)}%
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
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
                {document.metadata.tribunalLabelFr}
              </Badge>
            )}

            {formattedDate && (
              <Badge variant="outline" className="text-xs">
                {formattedDate}
              </Badge>
            )}

            {document.metadata.citedByCount != null && document.metadata.citedByCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {document.metadata.citedByCount} citations
              </Badge>
            )}
          </div>

          {document.chunkContent && (
            <p className={`text-sm text-muted-foreground ${viewMode === 'list' ? 'line-clamp-2' : 'line-clamp-1'}`}>
              {document.chunkContent}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
