'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Share2, Printer, Scale, FileText, Link2, Copy, Download,
  AlignLeft, PanelLeftClose, PanelLeftOpen,
  BookOpen, Building2, Calendar, Users, Layers, ChevronRight, ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { NORM_LEVELS_ORDERED, getNormLevelLabel, getNormLevelColor, getNormLevelOrder } from '@/lib/categories/norm-levels'
import type { SearchResultItem } from './DocumentExplorer'
import { formatDateLong, getCategoryLabel, formatCitation, getCategoryBorderColor } from './kb-browser-utils'
import { CodeTableOfContents, parseChunksToToc } from './CodeTableOfContents'
import type { TocEntry } from './CodeTableOfContents'

// =============================================================================
// TYPES
// =============================================================================

interface FullTextChunk {
  index: number
  content: string
  metadata: Record<string, unknown>
}

interface DocumentDetailPageProps {
  documentId: string
  initialDocument: SearchResultItem
  initialChunks: FullTextChunk[]
  initialRelations: SearchResultItem['relations'] | null
}

// =============================================================================
// HELPERS
// =============================================================================

const ARABIC_REGEX = /[\u0600-\u06FF]/

function isArabic(text: string): boolean {
  const sample = text.slice(0, 200)
  const arabicChars = (sample.match(/[\u0600-\u06FF]/g) || []).length
  return arabicChars / sample.length > 0.3
}

const HEADING_PATTERNS_DISPLAY = [
  { regex: /^(LIVRE\s+\w+|كتاب\s+\w+)/i, tag: 'h2' as const },
  { regex: /^(TITRE\s+\w+|عنوان\s+\w+|الباب\s+\w+)/i, tag: 'h3' as const },
  { regex: /^(CHAPITRE\s+\w+|CHAPTER\s+\w+|الفصل\s+(?!ال?\d)|الفرع\s+\w+)/i, tag: 'h4' as const },
  { regex: /^(SECTION\s+\w+|القسم\s+\w+)/i, tag: 'h5' as const },
  { regex: /^(Article\s+\d+|Art\.\s*\d+|الفصل\s+\d+|فصل\s+\d+)/i, tag: 'article' as const },
]

function getHeadingTag(content: string): typeof HEADING_PATTERNS_DISPLAY[0] | null {
  const firstLine = content.trim().split('\n')[0].trim()
  for (const p of HEADING_PATTERNS_DISPLAY) {
    if (p.regex.test(firstLine)) return p
  }
  return null
}

// =============================================================================
// CHUNK RENDERER
// =============================================================================

function ChunkBlock({
  chunk,
  isActive,
  chunkRef,
}: {
  chunk: FullTextChunk
  isActive: boolean
  chunkRef: (el: HTMLDivElement | null) => void
}) {
  const lines = chunk.content.trim().split('\n')
  const firstLine = lines[0].trim()
  const restLines = lines.slice(1).join('\n').trim()
  const heading = getHeadingTag(chunk.content)
  const dir = ARABIC_REGEX.test(firstLine) ? 'rtl' : 'ltr'

  return (
    <div
      ref={chunkRef}
      id={`chunk-${chunk.index}`}
      className={`transition-colors scroll-mt-6 ${isActive ? 'bg-primary/5 rounded-lg' : ''}`}
    >
      {heading ? (
        <div className={`py-3 ${heading.tag === 'h2' ? 'pt-6' : ''}`} dir={dir}>
          {heading.tag === 'h2' && (
            <h2 className="text-xl font-bold text-foreground border-b pb-2 mb-1">{firstLine}</h2>
          )}
          {heading.tag === 'h3' && (
            <h3 className="text-lg font-semibold text-foreground mt-4">{firstLine}</h3>
          )}
          {heading.tag === 'h4' && (
            <h4 className="text-base font-semibold text-foreground/80 mt-3">{firstLine}</h4>
          )}
          {heading.tag === 'h5' && (
            <h5 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mt-2">{firstLine}</h5>
          )}
          {heading.tag === 'article' && (
            <div className="flex items-baseline gap-3 mt-3">
              <span className="shrink-0 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs font-bold border border-amber-200 dark:border-amber-800">
                {firstLine}
              </span>
            </div>
          )}
          {restLines && (
            <p className="text-sm leading-relaxed mt-1 text-foreground/90 whitespace-pre-wrap" dir={dir}>
              {restLines}
            </p>
          )}
        </div>
      ) : (
        <p className="py-2 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap" dir={dir}>
          {chunk.content}
        </p>
      )}
    </div>
  )
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function DocumentDetailPage({
  documentId,
  initialDocument,
  initialChunks,
  initialRelations,
}: DocumentDetailPageProps) {
  const router = useRouter()

  // Data comes pre-fetched from the server — no client-side loading needed
  const document = initialDocument
  const chunks = initialChunks
  const relations = initialRelations ?? initialDocument.relations ?? null

  const [toc] = useState<TocEntry[]>(() => parseChunksToToc(chunks))
  const [activeChunkIndex, setActiveChunkIndex] = useState<number | undefined>()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const chunkRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const observerRef = useRef<IntersectionObserver | null>(null)

  // IntersectionObserver to track active TOC section
  useEffect(() => {
    if (!chunks || chunks.length === 0) return

    observerRef.current?.disconnect()

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = parseInt(entry.target.id.replace('chunk-', ''))
            if (!isNaN(idx)) setActiveChunkIndex(idx)
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )

    const currentRefs = chunkRefs.current
    Object.values(currentRefs).forEach((el) => {
      if (el) observerRef.current?.observe(el)
    })

    return () => observerRef.current?.disconnect()
  }, [chunks])

  const scrollToChunk = useCallback((chunkIndex: number) => {
    const el = chunkRefs.current[chunkIndex]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveChunkIndex(chunkIndex)
    }
  }, [])

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href)
    toast.success('Lien copié dans le presse-papiers')
  }

  const handleCite = () => {
    navigator.clipboard.writeText(formatCitation(document))
    toast.success('Citation copiée dans le presse-papiers')
  }

  const handleCopy = () => {
    const text = chunks.length > 0
      ? chunks.map((c) => c.content).join('\n\n')
      : document.chunkContent || document.title
    navigator.clipboard.writeText(text)
    toast.success('Contenu copié dans le presse-papiers')
  }

  const handleExport = () => {
    const content = chunks.length > 0
      ? [document.title, '', ...chunks.map((c) => c.content)].join('\n\n')
      : document.chunkContent || document.title
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = `${document.title.slice(0, 60).replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Document exporté')
  }

  const { metadata } = document
  const categoryColor = LEGAL_CATEGORY_COLORS[document.category as LegalCategory]
  const formattedDate = formatDateLong(metadata.decisionDate as string | null)
  const isAbroge = metadata.statut_vigueur === 'abroge'
  const contentIsArabic = chunks.length > 0
    ? isArabic(chunks[0].content)
    : (document.chunkContent ? isArabic(document.chunkContent) : false)

  const relationsCount =
    (relations?.cites?.length || 0) +
    (relations?.citedBy?.length || 0) +
    (relations?.supersedes?.length || 0) +
    (relations?.relatedCases?.length || 0)

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-6xl py-6 space-y-4 print:max-w-full">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 print:hidden">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 h-8 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            Retour
          </Button>
          <ChevronRight className="h-3 w-3" />
          <button
            onClick={() => router.push('/client/knowledge-base')}
            className="hover:text-foreground transition-colors"
          >
            Bibliothèque
          </button>
          <ChevronRight className="h-3 w-3" />
          <span
            className="text-foreground line-clamp-1 max-w-xs"
            title={document.title}
          >
            {document.title}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
            <Share2 className="h-4 w-4" />
            <span className="hidden sm:inline">Partager</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Imprimer</span>
          </Button>
        </div>
      </div>

      {/* Titre + badges */}
      <div className={`border-l-4 pl-4 space-y-2 ${getCategoryBorderColor(document.category)}`}>
        <h1
          className={`text-2xl font-bold leading-tight ${contentIsArabic ? 'text-right' : ''}`}
          dir={contentIsArabic ? 'rtl' : 'ltr'}
        >
          {document.title}
        </h1>
        <div className="flex flex-wrap gap-2">
          <Badge className={categoryColor || ''}>{getCategoryLabel(document.category)}</Badge>
          {document.normLevel && (
            <Badge className={`border ${getNormLevelColor(document.normLevel)}`}>
              <Scale className="h-3 w-3 mr-1" />
              {getNormLevelLabel(document.normLevel, 'fr')}
            </Badge>
          )}
          {metadata.decisionNumber && (
            <Badge variant="outline">N° {metadata.decisionNumber as string}</Badge>
          )}
          {isAbroge && <Badge variant="destructive">Abrogé</Badge>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 print:hidden flex-wrap">
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
        {toc.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="gap-1.5 ml-auto"
          >
            {sidebarOpen ? (
              <><PanelLeftClose className="h-4 w-4" /><span className="hidden sm:inline">Masquer TOC</span></>
            ) : (
              <><PanelLeftOpen className="h-4 w-4" /><span className="hidden sm:inline">Afficher TOC</span></>
            )}
          </Button>
        )}
      </div>

      {/* ─── LAYOUT 2 COLONNES ────────────────────────────────────────────── */}
      <div className="flex gap-6 min-h-0">

        {/* Sidebar TOC (sticky) */}
        {toc.length > 0 && sidebarOpen && (
          <aside className="hidden md:flex w-64 shrink-0 print:hidden">
            <div className="sticky top-4 self-start w-full border rounded-xl overflow-hidden bg-card max-h-[calc(100vh-120px)] flex flex-col">
              <CodeTableOfContents
                entries={toc}
                activeChunkIndex={activeChunkIndex}
                onNavigate={scrollToChunk}
              />
            </div>
          </aside>
        )}

        {/* Contenu principal */}
        <div className="flex-1 min-w-0 space-y-6">

          {/* Métadonnées condensées */}
          {(formattedDate || metadata.tribunalLabelFr || metadata.chambreLabelFr || relationsCount > 0) && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-xl border text-sm">
              {formattedDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Date</div>
                    <div className="font-medium">{formattedDate}</div>
                  </div>
                </div>
              )}
              {metadata.tribunalLabelFr && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Tribunal</div>
                    <div className="font-medium line-clamp-1">{metadata.tribunalLabelFr as string}</div>
                  </div>
                </div>
              )}
              {metadata.chambreLabelFr && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Chambre</div>
                    <div className="font-medium line-clamp-1">{metadata.chambreLabelFr as string}</div>
                  </div>
                </div>
              )}
              {relationsCount > 0 && (
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <div className="text-xs text-muted-foreground">Relations</div>
                    <div className="font-medium">{relationsCount} liées</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hiérarchie normative */}
          {document.normLevel && (
            <div className="p-4 bg-muted/20 rounded-xl border space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Scale className="h-4 w-4 text-muted-foreground" />
                Rang normatif — {getNormLevelLabel(document.normLevel, 'fr')}
                <span className="text-muted-foreground font-normal" dir="rtl">
                  {getNormLevelLabel(document.normLevel, 'ar')}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {NORM_LEVELS_ORDERED.map((level) => {
                  const isActive = level.value === document.normLevel
                  const isBefore = level.order < getNormLevelOrder(document.normLevel!)
                  return (
                    <div
                      key={level.value}
                      title={level.labelFr}
                      className={`h-2 rounded-sm transition-all ${
                        isActive
                          ? `flex-[2] ${level.badgeColor} border opacity-100`
                          : isBefore
                            ? 'flex-1 bg-muted opacity-50'
                            : 'flex-1 bg-muted/20 opacity-20'
                      }`}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* Texte complet — SSR: contenu disponible dès le chargement de la page */}
          <div className="border rounded-xl p-6 bg-card">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b">
              <AlignLeft className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Texte complet</span>
              {chunks.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-auto">
                  {chunks.length} fragments
                </Badge>
              )}
            </div>

            {chunks.length > 0 ? (
              <div className="space-y-1 divide-y divide-border/40">
                {chunks.map((chunk) => (
                  <ChunkBlock
                    key={chunk.index}
                    chunk={chunk}
                    isActive={chunk.index === activeChunkIndex}
                    chunkRef={(el) => { chunkRefs.current[chunk.index] = el }}
                  />
                ))}
              </div>
            ) : document.chunkContent ? (
              <p
                className="text-sm leading-relaxed whitespace-pre-wrap"
                dir={contentIsArabic ? 'rtl' : 'ltr'}
              >
                {document.chunkContent}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Texte complet non disponible.
              </p>
            )}
          </div>

          {/* Relations */}
          {relations && relationsCount > 0 && (
            <div className="border rounded-xl p-5 bg-card">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Relations juridiques</span>
                <Badge variant="secondary" className="ml-auto text-xs">{relationsCount}</Badge>
              </div>

              <div className="space-y-4">
                {relations.cites && relations.cites.length > 0 && (
                  <RelationsList title={`Cite (${relations.cites.length})`} items={relations.cites} />
                )}
                {relations.citedBy && relations.citedBy.length > 0 && (
                  <RelationsList title={`Cité par (${relations.citedBy.length})`} items={relations.citedBy} />
                )}
                {relations.supersedes && relations.supersedes.length > 0 && (
                  <RelationsList title={`Renverse (${relations.supersedes.length})`} items={relations.supersedes} variant="supersedes" />
                )}
                {relations.relatedCases && relations.relatedCases.length > 0 && (
                  <RelationsList title={`Cas similaires (${relations.relatedCases.length})`} items={relations.relatedCases} />
                )}
              </div>
            </div>
          )}

          {/* Base légale */}
          {metadata.legalBasis && (metadata.legalBasis as string[]).length > 0 && (
            <div className="border rounded-xl p-5 bg-card">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Base légale</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {(metadata.legalBasis as string[]).map((basis, i) => (
                  <Badge key={i} variant="outline">{basis}</Badge>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// =============================================================================
// RELATIONS LIST
// =============================================================================

interface RelationItem {
  relatedKbId?: string
  relationType: string
  relatedTitle: string
  relatedCategory: string
  context: string | null
  confidence: number | null
}

function RelationsList({
  title,
  items,
  variant = 'default',
}: {
  title: string
  items: RelationItem[]
  variant?: 'supersedes' | 'default'
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, 3)

  return (
    <div>
      <h4 className="font-semibold text-sm mb-2 text-muted-foreground">{title}</h4>
      <div className="space-y-2">
        {visible.map((rel, index) => (
          <div
            key={index}
            className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all flex items-start gap-2 ${
              variant === 'supersedes'
                ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                : 'bg-muted/20 hover:border-primary/30'
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
                if (rel.relatedKbId) router.push(`/client/knowledge-base/${rel.relatedKbId}`)
              }
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium line-clamp-1">{rel.relatedTitle}</p>
              {rel.context && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rel.context}</p>
              )}
            </div>
            {rel.confidence != null && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {Math.round(rel.confidence * 100)}%
              </Badge>
            )}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          </div>
        ))}
      </div>
      {items.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs h-7"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Voir moins' : `Voir ${items.length - 3} de plus`}
        </Button>
      )}
    </div>
  )
}
