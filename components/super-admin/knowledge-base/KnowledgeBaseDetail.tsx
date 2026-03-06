'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import {
  deleteKnowledgeDocumentAction,
  indexKnowledgeDocumentAction,
} from '@/app/actions/knowledge-base'
import { CategoryBadge } from './CategorySelector'
import { TagsList } from './TagsInput'
import { MetadataDisplay } from './MetadataForm'
import { VersionHistory, VersionBadge } from './VersionHistory'
import { RelatedDocuments } from './RelatedDocuments'
import { ContradictionsList } from './ContradictionsList'
import type { KnowledgeCategory } from '@/lib/knowledge-base/categories'

interface KnowledgeDocument {
  id: string
  category: string
  subcategory: string | null
  docType?: string | null
  normLevel?: string | null
  sourceOrigin?: string | null
  ragEnabled?: boolean
  language: 'ar' | 'fr'
  title: string
  description: string | null
  metadata: Record<string, unknown>
  tags: string[]
  sourceFile: string | null
  fullText: string | null
  isIndexed: boolean
  isActive: boolean
  isApproved?: boolean
  isAbroge?: boolean | null
  abrogeSuspected?: boolean | null
  abrogeConfidence?: 'low' | 'medium' | 'high' | null
  version: number
  chunkCount?: number
  uploadedBy: string | null
  uploadedByEmail?: string
  createdAt: Date | string
  updatedAt: Date | string
  qualityScore?: number | null
  qualityClarity?: number
  qualityStructure?: number
  qualityCompleteness?: number
  qualityReliability?: number
  qualityAnalysisSummary?: string | null
  qualityDetectedIssues?: string[]
  qualityRecommendations?: string[]
  qualityRequiresReview?: boolean
}

interface Version {
  id: string
  version: number
  title: string
  changeType: 'create' | 'update' | 'content_update' | 'file_replace' | 'restore'
  changeReason: string | null
  changedBy: string | null
  changedByEmail?: string
  changedAt: Date | string
}

interface Relation {
  id: string
  sourceDocumentId: string
  targetDocumentId: string
  relationType: string
  similarityScore: number
  contradictionType: string | null
  contradictionSeverity: 'low' | 'medium' | 'high' | 'critical' | null
  description: string | null
  sourceExcerpt: string | null
  targetExcerpt: string | null
  suggestedResolution: string | null
  status: 'pending' | 'confirmed' | 'dismissed' | 'resolved'
}

interface AdjacentDoc {
  id: string
  title: string
}

interface KnowledgeBaseDetailProps {
  document: KnowledgeDocument
  versions: Version[]
  relations?: Relation[]
  prevDoc?: AdjacentDoc | null
  nextDoc?: AdjacentDoc | null
  backUrl?: string
  filterQs?: string
}

// ─── Parser et rendu de contenu légal structuré ──────────────────────────────

type DocNodeType = 'page' | 'h1' | 'h2' | 'h3' | 'p'

interface DocNode {
  type: DocNodeType
  heading?: string
  body?: string
  text?: string
  pageNum?: number
}

const PAGE_SEP_RE = /---\s*[Pp]age\s*(\d+)\s*---/
const H1_RE = /^(الباب|التوطئة|المقدمة|المحتوي|المحتوى|TITRE\b|PARTIE\b|PRÉAMBULE|PREAMBLE)/i
const H2_RE = /^(القسم|الفرع|CHAPITRE\b|Section\b|SECTION\b)/i
const H3_RE = /^(الفصل|المادة|Art\.\s|Article\s|ARTICLE\s)/i

/** Sépare "الفصل الأول: contenu" → { before: "الفصل الأول", after: "contenu" } */
function splitAtFirstSep(line: string): { before: string; after?: string } {
  const colonIdx = line.indexOf(':')
  if (colonIdx > 0 && colonIdx <= 70) {
    const before = line.substring(0, colonIdx).trim()
    const after = line.substring(colonIdx + 1).trim()
    return { before, after: after || undefined }
  }
  const dashMatch = line.match(/^(.{1,70}?)\s[-–]\s(.+)$/)
  if (dashMatch) return { before: dashMatch[1].trim(), after: dashMatch[2].trim() }
  return { before: line }
}

/** Filtre les lignes OCR trop bruitées */
function isOcrNoise(line: string): boolean {
  if (line.length < 3) return true
  // Les lignes longues (> 300 chars) sont des paragraphes légitimes, pas du bruit
  if (line.length > 300) return false
  // ≥ 3 mots en majuscules latines isolés → bruit OCR (ex: "PAT IS RE", "PE EL ENT RSA")
  const capsWords = (line.match(/\b[A-Z]{2,}\b/g) || []).length
  if (capsWords >= 3) return true
  // Ratio élevé de majuscules latines (ex: "VV AYVLANLDYLY")
  const latinCaps = (line.match(/[A-Z]/g) || []).length
  if (latinCaps > 8 && latinCaps / line.length > 0.35) return true
  // Motif mixte Latin-Arabe-Latin typique OCR : "PAT RE: الباب PE EL"
  if (/\b[A-Z]{2,}\b.{0,25}[\u0600-\u06ff].{0,25}\b[A-Z]{2,}\b/.test(line)) return true
  return false
}

/** Détecte les entrées de table des matières : texte arabe + points + numéro de page */
function isTocEntry(line: string): boolean {
  return /[\u0600-\u06ff].*\.{3,}\s*\d+\s*$/.test(line)
}

/**
 * Nettoie les artéfacts OCR de pied de page AVANT le découpage en lignes.
 * Ces artéfacts peuvent être sur la même ligne que du contenu légitime.
 *
 * Patterns ciblés (jamais présents dans le texte juridique légitime) :
 *  - "الاسجرية التوسية 12"  — variante OCR de "الجمهورية التونسية" + numéro de page
 *  - "des 37 البسهورية التونسية"  — préfixe latin + variante OCR
 *  - "وستور (لبسهورية التونسية 34"  — "دستور" mal reconnu + footer
 *  - "sans 5", "pus 11", "pe 9"  — séquences bruit standalone
 */
function preprocessText(text: string): string {
  let t = text
  // Variantes garbled de "الجمهورية" (jamais dans le contenu réel)
  // Couverture : البسهورية | لبسهورية | الاسجرية | الببرية | السهورية | الجهورية
  // + préfixe latin optionnel (des, pe, Dis, ...) + suffixe التونسية + numéro
  t = t.replace(
    /(?:[A-Za-z()]{0,15}\s*)(البسهورية|لبسهورية|الاسجرية|الببرية|السهورية|الجهورية)(?:\s*(?:التونسية|التوسية|التوضية))?\s*\d{0,3}/g,
    ' '
  )
  // "وستور (...)" = "دستور" garbled (toujours un footer, jamais dans un article)
  t = t.replace(/وستور[^\n]{0,80}/g, ' ')
  // Séquences bruit latin court + numéro : "sans 5", "pus 11", "pe 9"
  t = t.replace(/\b(sans|pus|des|pe|en)\s+\d+\b/gi, ' ')
  // Espaces multiples (on préserve les \n)
  t = t.replace(/[ \t]{2,}/g, ' ')
  return t
}

function parseDocumentNodes(text: string): DocNode[] {
  const nodes: DocNode[] = []
  const processed = preprocessText(text)
  let pendingLines: string[] = []

  const flushPara = () => {
    if (!pendingLines.length) return
    const joined = pendingLines.join('\n').trim()
    if (joined) nodes.push({ type: 'p', text: joined })
    pendingLines = []
  }

  const processLine = (rawLine: string) => {
    const line = rawLine.trim()
    if (!line) { flushPara(); return }
    if (isOcrNoise(line)) return
    if (isTocEntry(line)) return
    if (H1_RE.test(line)) {
      flushPara()
      const { before, after } = splitAtFirstSep(line)
      nodes.push({ type: 'h1', heading: before, body: after })
      return
    }
    if (H2_RE.test(line)) {
      flushPara()
      const { before, after } = splitAtFirstSep(line)
      nodes.push({ type: 'h2', heading: before, body: after })
      return
    }
    if (H3_RE.test(line)) {
      flushPara()
      const { before, after } = splitAtFirstSep(line)
      nodes.push({ type: 'h3', heading: before, body: after })
      return
    }
    pendingLines.push(line)
  }

  // Tokeniser par séparateurs de page EN PREMIER.
  // Cela évite le bug où tout le contenu d'une page (long) est testé
  // comme une seule chaîne par isOcrNoise et filtré entièrement.
  const pageSepRe = /---\s*[Pp]age\s*(\d+)\s*---/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pageSepRe.exec(processed)) !== null) {
    // Contenu avant ce séparateur → traiter ligne par ligne
    const chunk = processed.slice(last, m.index)
    for (const line of chunk.split('\n')) processLine(line)
    // Ajouter le nœud page
    flushPara()
    nodes.push({ type: 'page', pageNum: parseInt(m[1]) })
    last = m.index + m[0].length
  }
  // Contenu après le dernier séparateur
  const tail = processed.slice(last)
  for (const line of tail.split('\n')) processLine(line)

  flushPara()
  return nodes
}

function renderDocumentNodes(nodes: DocNode[], isRtl: boolean) {
  const dir = isRtl ? 'rtl' : 'ltr'
  const textAlign = isRtl ? 'text-right' : 'text-left'
  const borderSide = isRtl ? 'border-r-4 pr-4' : 'border-l-4 pl-4'
  const articleFlex = isRtl ? 'flex-row-reverse' : 'flex-row'

  return nodes.map((node, i) => {
    switch (node.type) {
      case 'page':
        return (
          <div key={i} className="flex items-center gap-3 my-8 select-none" dir="ltr">
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              {isRtl ? `صفحة ${node.pageNum}` : `Page ${node.pageNum}`}
            </span>
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
        )

      case 'h1':
        return (
          <div key={i} className={`mt-12 mb-6 first:mt-0 ${borderSide} border-indigo-500 dark:border-indigo-400`} dir={dir}>
            <h2 className={`text-xl font-bold text-indigo-700 dark:text-indigo-300 ${textAlign}`}>
              {node.heading}
            </h2>
            {node.body && (
              <p className={`mt-2 text-gray-600 dark:text-gray-400 text-[15px] ${textAlign}`}
                style={{ lineHeight: isRtl ? '2.0' : '1.75' }}>
                {node.body}
              </p>
            )}
          </div>
        )

      case 'h2':
        return (
          <div key={i} className="mt-8 mb-4" dir={dir}>
            <div className={`${borderSide} border-teal-500 dark:border-teal-400`}>
              <h3 className={`text-[17px] font-semibold text-teal-700 dark:text-teal-300 ${textAlign}`}>
                {node.heading}
              </h3>
              {node.body && (
                <p className={`mt-1.5 text-gray-600 dark:text-gray-300 text-[14px] ${textAlign}`}
                  style={{ lineHeight: isRtl ? '2.0' : '1.7' }}>
                  {node.body}
                </p>
              )}
            </div>
          </div>
        )

      case 'h3':
        return (
          <div key={i}
            className="my-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/25 px-4 py-3"
            dir={dir}>
            <div className={`flex gap-3 ${articleFlex} items-start`}>
              <span className="text-[12px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/60 px-2.5 py-1 rounded-md whitespace-nowrap flex-shrink-0 mt-0.5 border border-amber-200 dark:border-amber-700/50">
                {node.heading}
              </span>
              {node.body && (
                <p className={`text-gray-800 dark:text-gray-200 flex-1 ${textAlign}`}
                  style={{ fontSize: isRtl ? '16px' : '15px', lineHeight: isRtl ? '2.0' : '1.8' }}>
                  {node.body}
                </p>
              )}
            </div>
          </div>
        )

      case 'p': {
        const text = node.text || ''
        if (!text) return null
        return (
          <p key={i}
            className={`mb-5 text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${textAlign}`}
            dir={dir}
            style={{
              lineHeight: isRtl ? '2.1' : '1.85',
              fontSize: isRtl ? '16.5px' : '15px',
            }}>
            {text}
          </p>
        )
      }

      default:
        return null
    }
  })
}

// ─── Badges helpers ───────────────────────────────────────────────────────────

const DOC_TYPE_COLORS: Record<string, string> = {
  TEXTES: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  JURIS: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  PROC: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  TEMPLATES: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  DOCTRINE: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
}

const DOC_TYPE_LABELS: Record<string, string> = {
  TEXTES: 'Textes',
  JURIS: 'Jurisprudence',
  PROC: 'Procédure',
  TEMPLATES: 'Modèles',
  DOCTRINE: 'Doctrine',
}

const NORM_LEVEL_LABELS: Record<string, string> = {
  constitution: 'Constitution',
  traite_int: 'Traité international',
  loi_org: 'Loi organique',
  loi_ord: 'Loi ordinaire',
  marsoum: 'Décret législatif',
  ordre_reg: 'Ordre réglementaire',
  arrete_min: 'Arrêté ministériel',
  acte_local: 'Acte local',
}

const SOURCE_ORIGIN_LABELS: Record<string, string> = {
  iort_gov_tn: 'IORT',
  '9anoun_tn': '9anoun.tn',
  cassation_tn: 'Cassation',
  google_drive: 'Google Drive',
  autre: 'Autre',
}

function QualityBar({ label, value }: { label: string; value?: number }) {
  if (value === undefined) return null
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{value}/100</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function KnowledgeBaseDetail({ document, versions, relations = [], prevDoc, nextDoc, backUrl, filterQs }: KnowledgeBaseDetailProps) {
  const router = useRouter()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copied, setCopied] = useState(false)

  const isRtl = document.language === 'ar'

  const handleIndex = async () => {
    setIndexing(true)
    try {
      const result = await indexKnowledgeDocumentAction(document.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Document indexé — ${result.chunksCreated} chunks créés.`)
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'indexation")
    } finally {
      setIndexing(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const result = await deleteKnowledgeDocumentAction(document.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Document supprimé')
        router.push('/super-admin/knowledge-base')
      }
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setDeleting(false)
      setDeleteDialogOpen(false)
    }
  }

  const handleCopy = () => {
    if (document.fullText) {
      navigator.clipboard.writeText(document.fullText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const createdAt =
    typeof document.createdAt === 'string' ? new Date(document.createdAt) : document.createdAt
  const updatedAt =
    typeof document.updatedAt === 'string' ? new Date(document.updatedAt) : document.updatedAt

  return (
    <div className="min-h-screen">
      {/* ── Sticky action bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-card/95 backdrop-blur border-b border-border px-6 py-3">
        <div className="flex items-center justify-between gap-4 max-w-[1400px] mx-auto">
          {/* Left: breadcrumb + title */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={backUrl ?? '/super-admin/knowledge-base'}
              className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
              title="Retour à la liste"
            >
              <Icons.arrowLeft className="h-5 w-5" />
            </Link>
            {prevDoc ? (
              <Link
                href={`/super-admin/knowledge-base/${prevDoc.id}${filterQs ? `?${filterQs}` : ''}`}
                className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
                title={prevDoc.title}
              >
                <Icons.chevronLeft className="h-5 w-5" />
              </Link>
            ) : (
              <span className="text-muted-foreground/30 flex-shrink-0">
                <Icons.chevronLeft className="h-5 w-5" />
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <CategoryBadge category={document.category} subcategory={document.subcategory} />
              <Badge variant={isRtl ? 'secondary' : 'outline'} className="text-xs">
                {isRtl ? 'عربية' : 'FR'}
              </Badge>
              {document.docType && (
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${DOC_TYPE_COLORS[document.docType] ?? 'bg-muted/30 text-foreground'}`}
                >
                  {DOC_TYPE_LABELS[document.docType] ?? document.docType}
                </span>
              )}
              {document.normLevel && NORM_LEVEL_LABELS[document.normLevel] && (
                <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  {NORM_LEVEL_LABELS[document.normLevel]}
                </span>
              )}
              {document.sourceOrigin && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted/40 text-foreground border border-border">
                  {SOURCE_ORIGIN_LABELS[document.sourceOrigin] ?? document.sourceOrigin}
                </span>
              )}
              {document.isApproved && (
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Approuvé
                </span>
              )}
              {document.isAbroge && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  Abrogé
                </span>
              )}
              {!document.ragEnabled && (
                <span className="text-xs px-2 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border line-through">
                  RAG off
                </span>
              )}
              <VersionBadge version={document.version} />
              <span className="text-muted-foreground text-xs truncate max-w-[300px]" title={document.title}>
                {document.title}
              </span>
            </div>
            {nextDoc ? (
              <Link
                href={`/super-admin/knowledge-base/${nextDoc.id}${filterQs ? `?${filterQs}` : ''}`}
                className="text-muted-foreground hover:text-foreground transition flex-shrink-0"
                title={nextDoc.title}
              >
                <Icons.chevronRight className="h-5 w-5" />
              </Link>
            ) : (
              <span className="text-muted-foreground/30 flex-shrink-0">
                <Icons.chevronRight className="h-5 w-5" />
              </span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {document.isIndexed ? (
              <Badge className="bg-green-500/20 text-green-300 text-xs">
                <Icons.check className="h-3 w-3 mr-1" />
                {document.chunkCount || 0} chunks
              </Badge>
            ) : (
              <Badge className="bg-yellow-500/20 text-yellow-300 text-xs">
                <Icons.clock className="h-3 w-3 mr-1" />
                Non indexé
              </Badge>
            )}
            <Button
              onClick={handleIndex}
              disabled={indexing}
              size="sm"
              variant="outline"
              className="border-blue-500 text-blue-400 hover:bg-blue-500/20 h-8 text-xs"
            >
              {indexing ? (
                <Icons.loader className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Icons.zap className="h-3 w-3 mr-1" />
              )}
              {document.isIndexed ? 'Réindexer' : 'Indexer'}
            </Button>
            <Link href={`/super-admin/knowledge-base/${document.id}/edit`}>
              <Button size="sm" variant="outline" className="border-border text-foreground h-8 text-xs">
                <Icons.edit className="h-3 w-3 mr-1" />
                Modifier
              </Button>
            </Link>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-8 text-xs"
            >
              <Icons.trash className="h-3 w-3 mr-1" />
              Supprimer
            </Button>
          </div>
        </div>
      </div>

      {/* ── Corps principal ────────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6 items-start">
        {/* ── Document viewer (colonne principale) ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {/* En-tête du document */}
          <div className="bg-card/60 border border-border rounded-xl p-6">
            <h1
              className={`text-2xl font-bold text-foreground mb-2 ${isRtl ? 'text-right' : ''}`}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {document.title}
            </h1>
            {document.description && (
              <p
                className={`text-muted-foreground text-sm leading-relaxed mt-2 ${isRtl ? 'text-right' : ''}`}
                dir={isRtl ? 'rtl' : 'ltr'}
              >
                {document.description}
              </p>
            )}
            {document.tags && document.tags.length > 0 && (
              <div className={`mt-4 ${isRtl ? 'flex justify-end' : ''}`}>
                <TagsList tags={document.tags} size="sm" />
              </div>
            )}
          </div>

          {/* Contenu complet — style page publique */}
          <div className="rounded-xl overflow-hidden shadow-sm border border-border/10">
            {/* Barre supérieure du viewer */}
            <div className="bg-muted/30 dark:bg-muted/50 border-b border-border dark:border-border px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground dark:text-muted-foreground">
                <Icons.fileText className="h-4 w-4" />
                <span>Contenu du document</span>
                {document.fullText && (
                  <span className="text-muted-foreground dark:text-muted-foreground">
                    · {document.fullText.length.toLocaleString('fr-FR')} caractères
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-7 text-xs text-muted-foreground dark:text-muted-foreground hover:text-foreground dark:hover:text-foreground"
              >
                {copied ? (
                  <>
                    <Icons.check className="h-3 w-3 mr-1 text-green-400" />
                    Copié !
                  </>
                ) : (
                  <>
                    <Icons.copy className="h-3 w-3 mr-1" />
                    Copier
                  </>
                )}
              </Button>
            </div>

            {/* Zone de lecture — fond adaptatif dark/light */}
            <div className="bg-white dark:bg-card rounded-b-xl px-10 py-10">
              {document.fullText ? (() => {
                const nodes = parseDocumentNodes(document.fullText)
                if (nodes.length > 0) return renderDocumentNodes(nodes, isRtl)
                // Fallback : aucun node parsé (ex: texte sans sauts de ligne) → affichage brut
                return (
                  <p className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-[15px] leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
                    {document.fullText}
                  </p>
                )
              })() : (
                <p className="text-gray-400 dark:text-muted-foreground italic text-center py-16">
                  Aucun contenu disponible
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Panneau latéral (sidebar sticky) ── */}
        <div className="w-72 flex-shrink-0 space-y-4 sticky top-[72px]">
          {/* Informations */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-foreground text-sm">Informations</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Créé</span>
                <span className="text-foreground" title={format(createdAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(createdAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Modifié</span>
                <span className="text-foreground" title={format(updatedAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(updatedAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              {document.uploadedByEmail && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">Par</span>
                  <span className="text-foreground truncate">{document.uploadedByEmail}</span>
                </div>
              )}
              {document.sourceFile && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground flex-shrink-0">Fichier</span>
                  <span
                    className="text-foreground truncate"
                    title={document.sourceFile}
                  >
                    {document.sourceFile.split('/').pop()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">RAG</span>
                <span className={document.ragEnabled ? 'text-green-400' : 'text-muted-foreground'}>
                  {document.ragEnabled ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              {document.isAbroge && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Statut</span>
                  <span className="text-red-400">Abrogé</span>
                </div>
              )}
              {!document.isAbroge && document.abrogeSuspected && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Abrogation</span>
                  <span className="text-yellow-400">
                    Suspectée ({document.abrogeConfidence})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métadonnées */}
          {Object.keys(document.metadata || {}).length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-foreground text-sm">Métadonnées</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <MetadataDisplay
                  category={document.category as KnowledgeCategory}
                  metadata={document.metadata}
                />
              </CardContent>
            </Card>
          )}

          {/* Qualité */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-foreground text-sm flex items-center justify-between">
                <span>Qualité</span>
                {document.qualityScore != null && (
                  <span
                    className={`text-sm font-bold ${
                      document.qualityScore >= 80
                        ? 'text-green-400'
                        : document.qualityScore >= 60
                          ? 'text-yellow-400'
                          : 'text-red-400'
                    }`}
                  >
                    {document.qualityScore}/100
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              {document.qualityScore != null ? (
                <>
                  <QualityBar label="Clarté" value={document.qualityClarity} />
                  <QualityBar label="Structure" value={document.qualityStructure} />
                  <QualityBar label="Complétude" value={document.qualityCompleteness} />
                  <QualityBar label="Fiabilité" value={document.qualityReliability} />
                  {document.qualityRequiresReview && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1 mt-1">
                      <Icons.alertTriangle className="h-3 w-3" />
                      Révision recommandée
                    </p>
                  )}
                  {document.qualityDetectedIssues && document.qualityDetectedIssues.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground mb-1">Problèmes :</p>
                      <ul className="text-xs text-yellow-400 space-y-0.5">
                        {document.qualityDetectedIssues.slice(0, 3).map((issue, i) => (
                          <li key={i}>· {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground text-xs">Analyse non effectuée</p>
              )}
            </CardContent>
          </Card>

          {/* Relations */}
          {relations.length > 0 && (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-foreground text-sm">Relations</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ContradictionsList relations={relations} currentDocumentId={document.id} />
              </CardContent>
            </Card>
          )}

          {/* Documents similaires */}
          {document.isIndexed && (
            <RelatedDocuments documentId={document.id} limit={5} threshold={0.6} />
          )}

          {/* Versions */}
          <VersionHistory
            documentId={document.id}
            versions={versions}
            currentVersion={document.version}
            onVersionRestored={() => router.refresh()}
          />
        </div>
      </div>

      {/* ── Dialog suppression ─────────────────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Cette action est irréversible. Le document &quot;{document.title}&quot; et tous ses chunks seront
              définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-muted text-foreground border-border">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <>
                  <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
