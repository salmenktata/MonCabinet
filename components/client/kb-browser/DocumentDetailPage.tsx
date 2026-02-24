'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, ExternalLink, Share2, Printer, Scale,
  BookOpen, Calendar, Building2, Users, FileText, Link2, Layers, AlignLeft, Copy, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { NORM_LEVELS_ORDERED, getNormLevelLabel, getNormLevelColor, getNormLevelOrder } from '@/lib/categories/norm-levels'
import type { SearchResultItem } from './DocumentExplorer'
import { formatDateLong, getCategoryLabel, formatCitation } from './kb-browser-utils'
import { FullTextTabContent } from './DocumentDetailModal'

interface DocumentDetailPageProps {
  documentId: string
}

export function DocumentDetailPage({ documentId }: DocumentDetailPageProps) {
  const router = useRouter()
  const [document, setDocument] = useState<SearchResultItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('content')

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/client/kb/${documentId}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        setDocument(data)
      })
      .catch((err) => setError(err.message || 'Erreur de chargement'))
      .finally(() => setIsLoading(false))
  }, [documentId])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Lien copié dans le presse-papiers')
  }

  const handleCite = () => {
    if (!document) return
    const citation = formatCitation(document)
    navigator.clipboard.writeText(citation)
    toast.success('Citation copiée dans le presse-papiers')
  }

  const handleCopy = () => {
    if (!document) return
    const text = document.chunkContent || document.title
    navigator.clipboard.writeText(text)
    toast.success('Contenu copié dans le presse-papiers')
  }

  const handleExport = () => {
    if (!document) return
    const text = [
      document.title,
      '',
      `Catégorie: ${getCategoryLabel(document.category)}`,
      document.metadata.tribunalLabelFr ? `Tribunal: ${document.metadata.tribunalLabelFr}` : null,
      formatDateLong(document.metadata.decisionDate as string | null)
        ? `Date: ${formatDateLong(document.metadata.decisionDate as string | null)}`
        : null,
      document.metadata.decisionNumber ? `N° ${document.metadata.decisionNumber}` : null,
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

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-6 py-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="container mx-auto max-w-4xl py-16 text-center space-y-4">
        <p className="text-destructive text-lg">
          {error || 'Document introuvable'}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    )
  }

  const { metadata, relations } = document
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const formattedDate = formatDateLong(metadata.decisionDate as string | null)

  return (
    <div className="container mx-auto max-w-4xl space-y-6 py-6">
      {/* Header avec breadcrumb */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 h-8">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <span>/</span>
          <span>Base de Connaissances</span>
          <span>/</span>
          <span className="text-foreground line-clamp-1 max-w-48">{document.title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            Partager
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Imprimer
          </Button>
        </div>
      </div>

      {/* Titre + badges */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold leading-tight">{document.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={categoryColor || ''}>
            {getCategoryLabel(document.category)}
          </Badge>
          {document.normLevel && (
            <Badge className={`border ${getNormLevelColor(document.normLevel)}`}>
              <Scale className="h-3 w-3 mr-1" />
              {getNormLevelLabel(document.normLevel, 'fr')}
            </Badge>
          )}
          {metadata.decisionNumber && (
            <Badge variant="outline">N° {metadata.decisionNumber}</Badge>
          )}
          {metadata.statut_vigueur === 'abroge' && (
            <Badge variant="destructive">Abrogé</Badge>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={handleCite} className="gap-1.5">
          <Link2 className="h-4 w-4" />
          Citer
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          <Copy className="h-4 w-4" />
          Copier
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="h-4 w-4" />
          Exporter
        </Button>
      </div>

      {/* Onglets */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 print:hidden" aria-label="Sections du document">
          <TabsTrigger value="content" aria-controls="tab-content">Contenu</TabsTrigger>
          <TabsTrigger value="metadata" aria-controls="tab-metadata">Métadonnées</TabsTrigger>
          <TabsTrigger value="relations" aria-controls="tab-relations">
            Relations
            {relations && (
              <Badge variant="secondary" className="ml-2">
                {(relations.cites?.length || 0) + (relations.citedBy?.length || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="fulltext" aria-controls="tab-fulltext">
            <AlignLeft className="h-3.5 w-3.5 mr-1" />
            Texte complet
          </TabsTrigger>
        </TabsList>

        {/* Contenu */}
        <TabsContent id="tab-content" value="content" className="space-y-4">
          {document.chunkContent && (
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Extrait</span>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{document.chunkContent}</p>
            </div>
          )}

          {metadata.legalBasis && (metadata.legalBasis as string[]).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Base légale</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(metadata.legalBasis as string[]).map((basis, index) => (
                  <Badge key={index} variant="outline">{basis}</Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Métadonnées */}
        <TabsContent id="tab-metadata" value="metadata" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {metadata.tribunalLabelFr && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Tribunal
                </div>
                <p className="text-sm pl-6">
                  {metadata.tribunalLabelFr as string}
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
                  {metadata.chambreLabelFr as string}
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
                <p className="text-sm pl-6">{metadata.decisionNumber as string}</p>
              </div>
            )}

            {document.normLevel && (
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  Rang normatif
                </div>
                <div className="pl-6 space-y-2">
                  <Badge className={`border ${getNormLevelColor(document.normLevel)}`}>
                    {getNormLevelLabel(document.normLevel, 'fr')} — {getNormLevelLabel(document.normLevel, 'ar')}
                  </Badge>
                  <div className="flex items-center gap-1 mt-2">
                    {NORM_LEVELS_ORDERED.map((level) => {
                      const isActive = level.value === document.normLevel
                      const isBefore = level.order < getNormLevelOrder(document.normLevel!)
                      return (
                        <div
                          key={level.value}
                          title={level.labelFr}
                          className={`h-3 rounded-sm transition-all ${
                            isActive
                              ? `flex-[2] ${level.badgeColor} border opacity-100`
                              : isBefore
                                ? 'flex-1 bg-muted opacity-40'
                                : 'flex-1 bg-muted/20 opacity-20'
                          }`}
                        />
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Niveau {getNormLevelOrder(document.normLevel)} sur 7 dans la hiérarchie des normes
                  </p>
                </div>
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
          </div>
        </TabsContent>

        {/* Relations */}
        <TabsContent id="tab-relations" value="relations" className="space-y-4">
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
                <RelationSection title={`Cite (${relations.cites.length})`} items={relations.cites} />
              )}
              {relations.citedBy && relations.citedBy.length > 0 && (
                <RelationSection title={`Cité par (${relations.citedBy.length})`} items={relations.citedBy} />
              )}
              {relations.supersedes && relations.supersedes.length > 0 && (
                <RelationSection title={`Renverse (${relations.supersedes.length})`} items={relations.supersedes} type="supersedes" />
              )}
              {relations.relatedCases && relations.relatedCases.length > 0 && (
                <RelationSection title={`Cas similaires (${relations.relatedCases.length})`} items={relations.relatedCases} />
              )}
            </>
          )}
        </TabsContent>

        {/* Texte complet */}
        <TabsContent id="tab-fulltext" value="fulltext" className="mt-4">
          {activeTab === 'fulltext' && (
            <FullTextTabContent documentId={document.kbId} title={document.title} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =============================================================================
// SECTION RELATIONS
// =============================================================================

interface RelationItem {
  relatedKbId?: string
  relationType: string
  relatedTitle: string
  relatedCategory: string
  context: string | null
  confidence: number | null
}

function RelationSection({
  title,
  items,
  type = 'default',
}: {
  title: string
  items: RelationItem[]
  type?: 'supersedes' | 'default'
}) {
  const router = useRouter()

  return (
    <div>
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      <div className="space-y-2">
        {items.map((rel, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${
              type === 'supersedes'
                ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 hover:border-amber-400'
                : 'bg-muted/30 hover:border-primary/40'
            }`}
            onClick={() => {
              if (rel.relatedKbId) {
                router.push(`/client/knowledge-base/${rel.relatedKbId}`)
              } else {
                router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(rel.relatedTitle)}`)
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (rel.relatedKbId) {
                  router.push(`/client/knowledge-base/${rel.relatedKbId}`)
                } else {
                  router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(rel.relatedTitle)}`)
                }
              }
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={`text-xs ${LEGAL_CATEGORY_COLORS[rel.relatedCategory as LegalCategory] || ''}`}>
                    {getCategoryLabel(rel.relatedCategory)}
                  </Badge>
                  {rel.confidence != null && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(rel.confidence * 100)}%
                    </Badge>
                  )}
                </div>
                <p className="text-sm font-medium mb-1">{rel.relatedTitle}</p>
                {rel.context && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{rel.context}</p>
                )}
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
