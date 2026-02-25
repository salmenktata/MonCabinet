'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  ArrowLeft, Share2, Printer, Scale, FileText, Link2, Copy, Download,
  AlignLeft, Loader2, ExternalLink, PanelLeftClose, PanelLeftOpen,
  BookOpen, Building2, Calendar, Users, Layers, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { LEGAL_CATEGORY_COLORS } from '@/lib/categories/legal-categories'
import type { LegalCategory } from '@/lib/categories/legal-categories'
import { NORM_LEVELS_ORDERED, getNormLevelLabel, getNormLevelColor, getNormLevelOrder } from '@/lib/categories/norm-levels'
import type { SearchResultItem } from './DocumentExplorer'
import { formatDateLong, getCategoryLabel, formatCitation } from './kb-browser-utils'
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
  initialDocument?: SearchResultItem
  initialChunks?: FullTextChunk[]
  initialRelations?: NonNullable<SearchResultItem['relations']>
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
        <div className={`py-3 ${heading.tag === 'h2' ? 'pt-8' : ''}`} dir={dir}>
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
            <div className="flex items-baseline gap-3 mt-4">
              <span className="shrink-0 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs font-bold border border-amber-200 dark:border-amber-800">
                {firstLine}
              </span>
            </div>
          )}
          {restLines && (
            <p className="text-[15px] leading-[1.75] mt-2 text-foreground/90 whitespace-pre-wrap" dir={dir}>
              {restLines}
            </p>
          )}
        </div>
      ) : (
        <p className="py-2.5 text-[15px] leading-[1.75] text-foreground/90 whitespace-pre-wrap" dir={dir}>
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

  const [document, setDocument] = useState<SearchResultItem | null>(initialDocument ?? null)
  const [isLoading, setIsLoading] = useState(!initialDocument)
  const [error, setError] = useState<string | null>(null)

  const [chunks, setChunks] = useState<FullTextChunk[] | null>(initialChunks ?? null)
  const [chunksLoading, setChunksLoading] = useState(!initialChunks)
  const [chunksError, setChunksError] = useState<string | null>(null)
  const [toc, setToc] = useState<TocEntry[]>(() => initialChunks ? parseChunksToToc(initialChunks) : [])
  const [activeChunkIndex, setActiveChunkIndex] = useState<number | undefined>()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const chunkRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Fetch document + relations seulement si non fournis server-side
  useEffect(() => {
    if (initialDocument) {
      if (initialRelations) {
        setDocument((prev) => prev ? { ...prev, relations: initialRelations } : prev)
      }
      return
    }

    setIsLoading(true)
    Promise.all([
      fetch(`/api/client/kb/${documentId}`).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      }),
      fetch(`/api/client/kb/${documentId}/relations`)
        .then((res) => res.ok ? res.json() : null)
        .catch(() => null),
    ])
      .then(([docData, relationsData]) => {
        setDocument({
          ...docData,
          relations: relationsData || undefined,
        })
      })
      .catch((err) => setError(err.message || 'Erreur de chargement'))
      .finally(() => setIsLoading(false))
  }, [documentId, initialDocument, initialRelations])

  // Fetch chunks seulement si non fournis server-side
  useEffect(() => {
    if (initialChunks) {
      setChunksLoading(false)
      return
    }

    setChunksLoading(true)
    fetch(`/api/client/kb/${documentId}/full-text`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        const c: FullTextChunk[] = data.chunks || []
        setChunks(c)
        setToc(parseChunksToToc(c))
      })
      .catch((err) => setChunksError(err.message))
      .finally(() => setChunksLoading(false))
  }, [documentId, initialChunks])

  // IntersectionObserver pour suivre la section active
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
    if (!document) return
    navigator.clipboard.writeText(formatCitation(document))
    toast.success('Citation copiée dans le presse-papiers')
  }

  const handleCopy = () => {
    if (!document) return
    const text = chunks ? chunks.map((c) => c.content).join('\n\n') : document.chunkContent || document.title
    navigator.clipboard.writeText(text)
    toast.success('Contenu copié dans le presse-papiers')
  }

  const handleExport = () => {
    if (!document) return
    const content = chunks
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

  // ─── LOADING ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl space-y-6 py-6">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-6">
          <Skeleton className="h-96 w-56 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !document) {
    return (
      <div className="container mx-auto max-w-4xl py-16 text-center space-y-4">
        <p className="text-destructive text-lg">{error || 'Document introuvable'}</p>
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
  const isAbroge = metadata.statut_vigueur === 'abroge'
  const contentIsArabic = document.chunkContent ? isArabic(document.chunkContent) : false

  const relationsCount =
    (relations?.cites?.length || 0) +
    (relations?.citedBy?.length || 0) +
    (relations?.supersedes?.length || 0) +
    (relations?.relatedCases?.length || 0)

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-6xl py-6 print:max-w-full">

      {/* ─── STICKY TOP BAR ───────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 -mx-4 px-4 bg-background/95 backdrop-blur-sm border-b mb-6 print:hidden">
        <div className="flex items-center justify-between h-12 gap-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1.5 h-8 -ml-2 shrink-0">
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <button
              onClick={() => router.push('/client/knowledge-base')}
              className="hover:text-foreground transition-colors shrink-0 text-sm"
            >
              Bibliothèque
            </button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="text-foreground truncate text-sm font-medium min-w-0" title={document.title}>
              {document.title}
            </span>
          </div>

          {/* Actions rapides */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 h-8">
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Partager</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="gap-1.5 h-8">
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Imprimer</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── TITRE + BADGES + MÉTADONNÉES ─────────────────────────────────── */}
      <div className="space-y-4 mb-6">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
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

          <h1
            className={`text-2xl font-bold leading-tight ${contentIsArabic ? 'text-right' : ''}`}
            dir={contentIsArabic ? 'rtl' : 'ltr'}
          >
            {document.title}
          </h1>

          {/* Métadonnées compactes en ligne */}
          {(formattedDate || metadata.tribunalLabelFr || metadata.chambreLabelFr || relationsCount > 0) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {formattedDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {formattedDate}
                </span>
              )}
              {metadata.tribunalLabelFr && (
                <span className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {metadata.tribunalLabelFr as string}
                </span>
              )}
              {metadata.chambreLabelFr && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {metadata.chambreLabelFr as string}
                </span>
              )}
              {relationsCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  {relationsCount} relations
                </span>
              )}
            </div>
          )}
        </div>

        {/* Hiérarchie normative compacte */}
        {document.normLevel && (
          <div className="flex items-center gap-3 py-2 px-3 bg-muted/30 rounded-lg border text-xs">
            <Scale className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium">{getNormLevelLabel(document.normLevel, 'fr')}</span>
            <span className="text-muted-foreground" dir="rtl">{getNormLevelLabel(document.normLevel, 'ar')}</span>
            <div className="flex items-center gap-0.5 ml-2 flex-1">
              {NORM_LEVELS_ORDERED.map((level) => {
                const isActive = level.value === document.normLevel
                const isBefore = level.order < getNormLevelOrder(document.normLevel!)
                return (
                  <div
                    key={level.value}
                    title={level.labelFr}
                    className={`h-1.5 rounded-sm transition-all ${
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

        {/* Barre d'actions */}
        <div className="flex items-center gap-2 pt-1 print:hidden flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCite} className="gap-1.5 h-8 text-xs">
            <Link2 className="h-3.5 w-3.5" />
            Citer
          </Button>
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 h-8 text-xs">
            <Copy className="h-3.5 w-3.5" />
            Copier
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5 h-8 text-xs">
            <Download className="h-3.5 w-3.5" />
            Exporter
          </Button>
          {toc.length > 0 && (
            <>
              <div className="w-px h-5 bg-border ml-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="gap-1.5 h-8 text-xs"
              >
                {sidebarOpen ? (
                  <><PanelLeftClose className="h-3.5 w-3.5" /><span className="hidden sm:inline">Masquer TOC</span></>
                ) : (
                  <><PanelLeftOpen className="h-3.5 w-3.5" /><span className="hidden sm:inline">Afficher TOC</span></>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── LAYOUT 2 COLONNES ────────────────────────────────────────────── */}
      <div className="flex gap-6 min-h-0">

        {/* Sidebar TOC (sticky) */}
        {toc.length > 0 && sidebarOpen && (
          <aside className="hidden md:flex w-60 shrink-0 print:hidden">
            <div className="sticky top-[60px] self-start w-full border rounded-xl overflow-hidden bg-card max-h-[calc(100vh-80px)] flex flex-col">
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

          {/* Texte complet */}
          <div className="border rounded-xl bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3.5 border-b bg-muted/20">
              <AlignLeft className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Texte complet</span>
              {chunks && (
                <Badge variant="secondary" className="text-xs ml-auto">
                  {chunks.length} fragments
                </Badge>
              )}
            </div>

            <div className="px-6 py-5">
              {chunksLoading && (
                <div className="flex items-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Chargement du texte…</span>
                </div>
              )}

              {chunksError && !chunks && (
                <div className="py-4">
                  {document.chunkContent ? (
                    <p
                      className="text-[15px] leading-[1.75] whitespace-pre-wrap"
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
              )}

              {!chunksLoading && chunks && chunks.length > 0 && (
                <div className="space-y-0 divide-y divide-border/30">
                  {chunks.map((chunk) => (
                    <ChunkBlock
                      key={chunk.index}
                      chunk={chunk}
                      isActive={chunk.index === activeChunkIndex}
                      chunkRef={(el) => { chunkRefs.current[chunk.index] = el }}
                    />
                  ))}
                </div>
              )}

              {!chunksLoading && !chunksError && chunks && chunks.length === 0 && document.chunkContent && (
                <p
                  className="text-[15px] leading-[1.75] whitespace-pre-wrap"
                  dir={contentIsArabic ? 'rtl' : 'ltr'}
                >
                  {document.chunkContent}
                </p>
              )}
            </div>
          </div>

          {/* Relations */}
          {relations && relationsCount > 0 && (
            <div className="border rounded-xl bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-3.5 border-b bg-muted/20">
                <BookOpen className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Relations juridiques</span>
                <Badge variant="secondary" className="ml-auto text-xs">{relationsCount}</Badge>
              </div>

              <div className="px-6 py-5 space-y-5">
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
            <div className="border rounded-xl bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-6 py-3.5 border-b bg-muted/20">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">Base légale</span>
              </div>
              <div className="px-6 py-4 flex flex-wrap gap-2">
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
      <h4 className="font-semibold text-xs uppercase tracking-wider mb-2 text-muted-foreground">{title}</h4>
      <div className="space-y-1.5">
        {visible.map((rel, index) => (
          <div
            key={index}
            className={`px-3 py-2.5 rounded-lg border cursor-pointer transition-all flex items-center gap-2 group ${
              variant === 'supersedes'
                ? 'border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 hover:border-amber-300'
                : 'bg-muted/20 hover:border-foreground/20 hover:shadow-sm'
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
              <p className="text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">{rel.relatedTitle}</p>
              {rel.context && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{rel.context}</p>
              )}
            </div>
            {rel.confidence != null && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {Math.round(rel.confidence * 100)}%
              </Badge>
            )}
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
