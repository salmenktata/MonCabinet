'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import { BookOpen, Scale, Calendar, Building2, Users, FileText, Link2, Copy, Download } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import type { SearchResultItem } from './DocumentExplorer'
import { formatDateLong, getCategoryLabel } from './kb-browser-utils'

// =============================================================================
// TYPES
// =============================================================================

interface DocumentDetailModalProps {
  document: SearchResultItem
  open: boolean
  onOpenChange: (open: boolean) => void
  onCopy?: () => void
  onExport?: () => void
  onAddToDossier?: () => void
}

// =============================================================================
// COMPOSANT
// =============================================================================

export function DocumentDetailModal({
  document,
  open,
  onOpenChange,
  onCopy,
  onExport,
  onAddToDossier,
}: DocumentDetailModalProps) {
  const { metadata, relations } = document
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const formattedDate = formatDateLong(metadata.decisionDate as string | null)

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy()
    } else {
      const text = document.chunkContent || document.title
      navigator.clipboard.writeText(text)
      toast.success('Contenu copié dans le presse-papiers')
    }
  }, [onCopy, document])

  const handleExport = useCallback(() => {
    if (onExport) {
      onExport()
    } else {
      const text = [
        document.title,
        '',
        `Catégorie: ${getCategoryLabel(document.category)}`,
        metadata.tribunalLabelFr ? `Tribunal: ${metadata.tribunalLabelFr}` : null,
        formattedDate ? `Date: ${formattedDate}` : null,
        metadata.decisionNumber ? `N° ${metadata.decisionNumber}` : null,
        '',
        document.chunkContent || '',
      ].filter(Boolean).join('\n')

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = globalThis.document.createElement('a')
      a.href = url
      a.download = `${document.title.slice(0, 60).replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '_')}.txt`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Document exporté')
    }
  }, [onExport, document, metadata, formattedDate])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl pr-8">{document.title}</DialogTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge className={categoryColor || ''}>
              {getCategoryLabel(document.category)}
            </Badge>
            {document.similarity != null && document.similarity < 1 && (
              <Badge variant="outline">
                Pertinence: {Math.round(document.similarity * 100)}%
              </Badge>
            )}
            {metadata.decisionNumber && (
              <Badge variant="outline">N° {metadata.decisionNumber}</Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs defaultValue="content" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="content">Contenu</TabsTrigger>
            <TabsTrigger value="metadata">Métadonnées</TabsTrigger>
            <TabsTrigger value="relations">
              Relations
              {relations && (
                <Badge variant="secondary" className="ml-2">
                  {(relations.cites?.length || 0) + (relations.citedBy?.length || 0)}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Onglet Contenu */}
          <TabsContent value="content" className="space-y-4">
            {document.chunkContent && (
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Extrait</span>
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {document.chunkContent}
                </p>
              </div>
            )}

            {typeof (metadata as Record<string, unknown>).solution === 'string' && (
              <div className="border-l-4 border-primary pl-4 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Solution</span>
                </div>
                <p className="text-sm">{String((metadata as Record<string, unknown>).solution)}</p>
              </div>
            )}

            {metadata.legalBasis && metadata.legalBasis.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Base légale</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {metadata.legalBasis.map((basis, index) => (
                    <Badge key={index} variant="outline">{basis}</Badge>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Onglet Métadonnées */}
          <TabsContent value="metadata" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metadata.tribunalLabelFr && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    Tribunal
                  </div>
                  <p className="text-sm pl-6">
                    {metadata.tribunalLabelFr}
                    {metadata.tribunalLabelAr && ` (${metadata.tribunalLabelAr})`}
                  </p>
                </div>
              )}

              {metadata.chambreLabelFr && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    Chambre
                  </div>
                  <p className="text-sm pl-6">
                    {metadata.chambreLabelFr}
                    {metadata.chambreLabelAr && ` (${metadata.chambreLabelAr})`}
                  </p>
                </div>
              )}

              {formattedDate && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Date de décision
                  </div>
                  <p className="text-sm pl-6">{formattedDate}</p>
                </div>
              )}

              {metadata.decisionNumber && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Numéro
                  </div>
                  <p className="text-sm pl-6">{metadata.decisionNumber}</p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                  Citations
                </div>
                <div className="text-sm pl-6 space-y-1">
                  <div>Cite : {metadata.citesCount || 0} documents</div>
                  <div>Cité par : {metadata.citedByCount || 0} documents</div>
                </div>
              </div>

              {metadata.extractionConfidence != null && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    Confiance extraction
                  </div>
                  <Badge variant={metadata.extractionConfidence >= 0.8 ? 'default' : 'secondary'} className="ml-6">
                    {Math.round(metadata.extractionConfidence * 100)}%
                  </Badge>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Onglet Relations */}
          <TabsContent value="relations" className="space-y-4">
            {!relations || (
              !relations.cites?.length &&
              !relations.citedBy?.length &&
              !relations.supersedes?.length &&
              !relations.supersededBy?.length &&
              !relations.relatedCases?.length
            ) ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aucune relation juridique identifiée
              </p>
            ) : (
              <>
                {relations.cites && relations.cites.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3">
                      Cite ({relations.cites.length})
                    </h4>
                    <div className="space-y-2">
                      {relations.cites.map((rel, index) => (
                        <RelationCard key={index} relation={rel} />
                      ))}
                    </div>
                  </div>
                )}

                {relations.citedBy && relations.citedBy.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3">
                      Cité par ({relations.citedBy.length})
                    </h4>
                    <div className="space-y-2">
                      {relations.citedBy.map((rel, index) => (
                        <RelationCard key={index} relation={rel} />
                      ))}
                    </div>
                  </div>
                )}

                {relations.supersedes && relations.supersedes.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3">
                      Renverse ({relations.supersedes.length})
                    </h4>
                    <div className="space-y-2">
                      {relations.supersedes.map((rel, index) => (
                        <RelationCard key={index} relation={rel} type="supersedes" />
                      ))}
                    </div>
                  </div>
                )}

                {relations.relatedCases && relations.relatedCases.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-3">
                      Cas similaires ({relations.relatedCases.length})
                    </h4>
                    <div className="space-y-2">
                      {relations.relatedCases.map((rel, index) => (
                        <RelationCard key={index} relation={rel} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <div className="flex gap-2 w-full justify-between">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                Copier
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
            </div>

            {onAddToDossier && (
              <Button onClick={onAddToDossier}>
                Ajouter au Dossier
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =============================================================================
// COMPOSANT RELATION CARD
// =============================================================================

interface RelationCardProps {
  relation: {
    relationType: string
    relatedTitle: string
    relatedCategory: string
    context: string | null
    confidence: number | null
  }
  type?: 'supersedes' | 'default'
}

function RelationCard({ relation, type = 'default' }: RelationCardProps) {
  return (
    <div className={`p-3 rounded-lg border ${type === 'supersedes' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950' : 'bg-muted/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge className={`text-xs ${LEGAL_CATEGORY_COLORS[relation.relatedCategory as LegalCategory] || ''}`}>
              {getCategoryLabel(relation.relatedCategory)}
            </Badge>
            {relation.confidence != null && (
              <Badge variant="secondary" className="text-xs">
                {Math.round(relation.confidence * 100)}%
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium mb-1">{relation.relatedTitle}</p>
          {relation.context && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {relation.context}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

