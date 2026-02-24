'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BookOpen, Scale, Calendar, Building2, Users, FileText, Link2, Copy, Download,
  Layers, AlignLeft, Search as SearchIcon, X, Loader2, ExternalLink,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import type { SearchResultItem } from './DocumentExplorer'
import { formatDateLong, getCategoryLabel, formatCitation } from './kb-browser-utils'
import {
  NORM_LEVELS_ORDERED,
  getNormLevelLabel,
  getNormLevelColor,
  getNormLevelOrder,
} from '@/lib/categories/norm-levels'

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

interface FullTextChunk {
  index: number
  content: string
  metadata: Record<string, unknown>
}

interface TocEntry {
  label: string
  chunkIndex: number
  level: 'livre' | 'titre' | 'chapitre' | 'section' | 'article'
}

// =============================================================================
// HELPERS
// =============================================================================

const HEADING_PATTERNS: Array<{ regex: RegExp; level: TocEntry['level'] }> = [
  { regex: /^(LIVRE\s+\w+|كتاب\s+\w+)/i, level: 'livre' },
  { regex: /^(TITRE\s+\w+|عنوان\s+\w+|الباب\s+\w+)/i, level: 'titre' },
  { regex: /^(CHAPITRE\s+\w+|CHAPTER\s+\w+|الفصل\s+(?!ال?\d)|الفرع\s+\w+)/i, level: 'chapitre' },
  { regex: /^(SECTION\s+\w+|القسم\s+\w+)/i, level: 'section' },
  { regex: /^(Article\s+\d+|Art\.\s*\d+|الفصل\s+\d+|فصل\s+\d+)/i, level: 'article' },
]

function detectHeading(content: string): TocEntry['level'] | null {
  const firstLine = content.trim().split('\n')[0].trim()
  for (const { regex, level } of HEADING_PATTERNS) {
    if (regex.test(firstLine)) return level
  }
  return null
}

function getHeadingLabel(content: string): string {
  return content.trim().split('\n')[0].trim().slice(0, 80)
}

function buildToc(chunks: FullTextChunk[]): TocEntry[] {
  const toc: TocEntry[] = []
  for (const chunk of chunks) {
    const level = detectHeading(chunk.content)
    if (level) {
      toc.push({
        label: getHeadingLabel(chunk.content),
        chunkIndex: chunk.index,
        level,
      })
    }
  }
  return toc
}

const HEADING_INDENT: Record<TocEntry['level'], string> = {
  livre: '',
  titre: 'pl-2',
  chapitre: 'pl-4',
  section: 'pl-6',
  article: 'pl-8',
}

const HEADING_FONT: Record<TocEntry['level'], string> = {
  livre: 'font-bold text-sm',
  titre: 'font-semibold text-sm',
  chapitre: 'font-medium text-sm',
  section: 'text-sm',
  article: 'text-xs text-muted-foreground',
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 rounded-sm px-0.5">
        {part}
      </mark>
    ) : part
  )
}

// =============================================================================
// ONGLET TEXTE COMPLET (exporté pour DocumentDetailPage)
// =============================================================================

export function FullTextTabContent({ documentId, title }: { documentId: string; title: string }) {
  const [chunks, setChunks] = useState<FullTextChunk[] | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [toc, setToc] = useState<TocEntry[]>([])
  const chunkRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const hasLoaded = useRef(false)

  useEffect(() => {
    if (hasLoaded.current) return
    hasLoaded.current = true
    setIsLoading(true)
    fetch(`/api/client/kb/${documentId}/full-text`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const c: FullTextChunk[] = data.chunks || []
        setChunks(c)
        setToc(buildToc(c))
      })
      .catch((err) => setError(err.message || 'Erreur de chargement'))
      .finally(() => setIsLoading(false))
  }, [documentId])

  const scrollToChunk = (chunkIndex: number) => {
    chunkRefs.current[chunkIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDownload = useCallback(() => {
    if (!chunks) return
    const text = chunks.map((c) => c.content).join('\n\n---\n\n')
    const blob = new Blob([title + '\n\n' + text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = `${title.slice(0, 60).replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Texte téléchargé')
  }, [chunks, title])

  const matchCount = chunks
    ? chunks.reduce((acc, c) => {
        if (!searchQuery.trim()) return acc
        const re = new RegExp(searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        return acc + (c.content.match(re)?.length || 0)
      }, 0)
    : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Chargement du texte…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        Erreur : {error}
      </div>
    )
  }

  if (!chunks) return null

  return (
    <div className="flex gap-4 min-h-0">
      {/* Table des matières latérale */}
      {toc.length > 0 && (
        <div className="w-56 shrink-0 border rounded-lg p-3 max-h-[60vh] overflow-y-auto sticky top-0 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Table des matières</p>
          {toc.map((entry, i) => (
            <button
              key={i}
              onClick={() => scrollToChunk(entry.chunkIndex)}
              className={`block w-full text-left hover:text-primary transition-colors line-clamp-2 ${HEADING_INDENT[entry.level]} ${HEADING_FONT[entry.level]}`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}

      {/* Contenu principal */}
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans le texte…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          {searchQuery && (
            <span className="text-xs text-muted-foreground shrink-0">
              {matchCount} occurrence{matchCount !== 1 ? 's' : ''}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={handleDownload} className="h-8 shrink-0">
            <Download className="h-3.5 w-3.5 mr-1" />
            TXT
          </Button>
        </div>

        <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
          {chunks.map((chunk) => {
            const headingLevel = detectHeading(chunk.content)
            const isHeading = headingLevel !== null
            const isArticle = headingLevel === 'article'
            const hasMatch = searchQuery.trim()
              ? chunk.content.toLowerCase().includes(searchQuery.toLowerCase())
              : true

            return (
              <div
                key={chunk.index}
                ref={(el) => { chunkRefs.current[chunk.index] = el }}
                id={`chunk-${chunk.index}`}
                className={`text-sm leading-relaxed whitespace-pre-wrap rounded p-2 scroll-mt-4 ${
                  isHeading && !isArticle
                    ? 'font-semibold bg-muted/40 border-l-2 border-primary/40'
                    : isArticle
                    ? 'font-medium text-primary/90'
                    : 'text-foreground/80'
                } ${!hasMatch && searchQuery ? 'opacity-30' : ''}`}
              >
                {highlightText(chunk.content, searchQuery)}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-muted-foreground text-right">{chunks.length} fragments</p>
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function DocumentDetailModal({
  document,
  open,
  onOpenChange,
  onCopy,
  onExport,
  onAddToDossier,
}: DocumentDetailModalProps) {
  const router = useRouter()
  const { metadata, relations } = document
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const formattedDate = formatDateLong(metadata.decisionDate as string | null)
  const [activeTab, setActiveTab] = useState('content')

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy()
    } else {
      const text = document.chunkContent || document.title
      navigator.clipboard.writeText(text)
      toast.success('Contenu copié dans le presse-papiers')
    }
  }, [onCopy, document])

  const handleCite = useCallback(() => {
    const citation = formatCitation(document)
    navigator.clipboard.writeText(citation)
    toast.success('Citation copiée dans le presse-papiers')
  }, [document])

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
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        aria-describedby="document-detail-tabs"
      >
        <DialogHeader>
          <DialogTitle className="text-xl pr-8">{document.title}</DialogTitle>
          <div className="flex flex-wrap gap-2 mt-2">
            <Badge className={categoryColor || ''}>
              {getCategoryLabel(document.category)}
            </Badge>
            {document.normLevel && (
              <Badge className={`border ${getNormLevelColor(document.normLevel)}`}>
                <Scale className="h-3 w-3 mr-1" />
                {getNormLevelLabel(document.normLevel, 'fr')}
              </Badge>
            )}
            {document.similarity != null && document.similarity < 1 && (
              <Badge variant="outline">
                Pertinence: {Math.round(document.similarity * 100)}%
              </Badge>
            )}
            {metadata.decisionNumber && (
              <Badge variant="outline">N° {metadata.decisionNumber}</Badge>
            )}
            {metadata.statut_vigueur === 'abroge' && (
              <Badge variant="destructive">Abrogé</Badge>
            )}
          </div>
        </DialogHeader>

        <Tabs
          id="document-detail-tabs"
          value={activeTab}
          onValueChange={setActiveTab}
          className="mt-4"
        >
          <TabsList
            className="grid w-full grid-cols-4"
            aria-label="Sections du document"
          >
            <TabsTrigger value="content" aria-controls="modal-tab-content">Contenu</TabsTrigger>
            <TabsTrigger value="metadata" aria-controls="modal-tab-metadata">Métadonnées</TabsTrigger>
            <TabsTrigger value="relations" aria-controls="modal-tab-relations">
              Relations
              {relations && (
                <Badge variant="secondary" className="ml-2">
                  {(relations.cites?.length || 0) + (relations.citedBy?.length || 0)}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="fulltext" aria-controls="modal-tab-fulltext">
              <AlignLeft className="h-3.5 w-3.5 mr-1" />
              Texte complet
            </TabsTrigger>
          </TabsList>

          {/* Onglet Contenu */}
          <TabsContent id="modal-tab-content" value="content" className="space-y-4">
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
          <TabsContent id="modal-tab-metadata" value="metadata" className="space-y-4">
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
          <TabsContent id="modal-tab-relations" value="relations" className="space-y-4">
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
                        <RelationCard
                          key={index}
                          relation={rel}
                          onNavigate={(id, title) => {
                            onOpenChange(false)
                            if (id) {
                              router.push(`/client/knowledge-base/${id}`)
                            } else {
                              router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(title)}`)
                            }
                          }}
                        />
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
                        <RelationCard
                          key={index}
                          relation={rel}
                          onNavigate={(id, title) => {
                            onOpenChange(false)
                            if (id) {
                              router.push(`/client/knowledge-base/${id}`)
                            } else {
                              router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(title)}`)
                            }
                          }}
                        />
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
                        <RelationCard
                          key={index}
                          relation={rel}
                          type="supersedes"
                          onNavigate={(id, title) => {
                            onOpenChange(false)
                            if (id) {
                              router.push(`/client/knowledge-base/${id}`)
                            } else {
                              router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(title)}`)
                            }
                          }}
                        />
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
                        <RelationCard
                          key={index}
                          relation={rel}
                          onNavigate={(id, title) => {
                            onOpenChange(false)
                            if (id) {
                              router.push(`/client/knowledge-base/${id}`)
                            } else {
                              router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(title)}`)
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Recherche globale */}
                <div className="pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => {
                      onOpenChange(false)
                      router.push(`/client/knowledge-base?mode=general&q=${encodeURIComponent(document.title)}`)
                    }}
                  >
                    <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
                    Rechercher tous les documents citant ce texte
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          {/* Onglet Texte complet */}
          <TabsContent id="modal-tab-fulltext" value="fulltext" className="mt-4">
            {activeTab === 'fulltext' && (
              <FullTextTabContent documentId={document.kbId} title={document.title} />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-6">
          <div className="flex gap-2 w-full justify-between flex-wrap">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleCite}>
                <Link2 className="h-4 w-4 mr-2" />
                Citer
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-2" />
                Copier
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Exporter
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/client/knowledge-base/${document.kbId}`} target="_blank">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Page complète
                </Link>
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
    relatedKbId?: string
    relationType: string
    relatedTitle: string
    relatedCategory: string
    context: string | null
    confidence: number | null
  }
  type?: 'supersedes' | 'default'
  onNavigate?: (relatedKbId: string | undefined, relatedTitle: string) => void
}

function RelationCard({ relation, type = 'default', onNavigate }: RelationCardProps) {
  const isClickable = !!onNavigate

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        type === 'supersedes'
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          : 'bg-muted/30'
      } ${isClickable ? 'cursor-pointer hover:shadow-sm hover:border-primary/40' : ''}`}
      onClick={() => onNavigate?.(relation.relatedKbId, relation.relatedTitle)}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onNavigate?.(relation.relatedKbId, relation.relatedTitle)
        }
      }}
    >
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
        {isClickable && (
          <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </div>
    </div>
  )
}
