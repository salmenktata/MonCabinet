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

interface KnowledgeBaseDetailProps {
  document: KnowledgeDocument
  versions: Version[]
  relations?: Relation[]
}

// ─── Détection et rendu du contenu structuré légal ───────────────────────────

const ARTICLE_HEADING_PATTERN =
  /^(الفصل|الباب|الجزء|القسم|المادة|الفقرة|الفرع|Art\.|Article|Chapitre|Titre|Section|Paragraphe|CHAPITRE|TITRE|ARTICLE)\s/

function renderLegalContent(text: string, isRtl: boolean) {
  const paragraphs = text.split(/\n{2,}/)

  return paragraphs.map((para, pi) => {
    const trimmed = para.trim()
    if (!trimmed) return null

    const lines = trimmed.split('\n')
    const firstLine = lines[0].trim()

    if (ARTICLE_HEADING_PATTERN.test(firstLine)) {
      const rest = lines.slice(1).join('\n').trim()
      return (
        <div key={pi} className="mb-6">
          <h3
            className={`text-[15px] font-bold text-gray-800 mb-2 border-b border-gray-200 pb-1 ${isRtl ? 'text-right' : ''}`}
          >
            {firstLine}
          </h3>
          {rest && (
            <p
              className={`text-gray-700 whitespace-pre-wrap ${isRtl ? 'text-right' : ''}`}
              style={{ lineHeight: isRtl ? '2.2' : '1.85' }}
            >
              {rest}
            </p>
          )}
        </div>
      )
    }

    return (
      <p
        key={pi}
        className={`mb-5 text-gray-700 whitespace-pre-wrap ${isRtl ? 'text-right' : ''}`}
        style={{ lineHeight: isRtl ? '2.2' : '1.85' }}
      >
        {trimmed}
      </p>
    )
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
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-200">{value}/100</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────

export function KnowledgeBaseDetail({ document, versions, relations = [] }: KnowledgeBaseDetailProps) {
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
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur border-b border-slate-700/60 px-6 py-3">
        <div className="flex items-center justify-between gap-4 max-w-[1400px] mx-auto">
          {/* Left: breadcrumb + title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/super-admin/knowledge-base"
              className="text-slate-400 hover:text-white transition flex-shrink-0"
            >
              <Icons.arrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <CategoryBadge category={document.category} subcategory={document.subcategory} />
              <Badge variant={isRtl ? 'secondary' : 'outline'} className="text-xs">
                {isRtl ? 'عربية' : 'FR'}
              </Badge>
              {document.docType && (
                <span
                  className={`text-xs px-2 py-0.5 rounded border font-medium ${DOC_TYPE_COLORS[document.docType] ?? 'bg-slate-600/30 text-slate-300'}`}
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
                <span className="text-xs px-2 py-0.5 rounded bg-slate-600/40 text-slate-300 border border-slate-500/30">
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
                <span className="text-xs px-2 py-0.5 rounded bg-slate-600/30 text-slate-400 border border-slate-500/20 line-through">
                  RAG off
                </span>
              )}
              <VersionBadge version={document.version} />
              <span className="text-slate-500 text-xs truncate max-w-[300px]" title={document.title}>
                {document.title}
              </span>
            </div>
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
              <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 h-8 text-xs">
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
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
            <h1
              className={`text-2xl font-bold text-white mb-2 ${isRtl ? 'text-right' : ''}`}
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {document.title}
            </h1>
            {document.description && (
              <p
                className={`text-slate-400 text-sm leading-relaxed mt-2 ${isRtl ? 'text-right' : ''}`}
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
          <div className="rounded-xl overflow-hidden shadow-sm border border-slate-200/10">
            {/* Barre supérieure du viewer */}
            <div className="bg-slate-700/50 border-b border-slate-600/40 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Icons.fileText className="h-4 w-4" />
                <span>Contenu du document</span>
                {document.fullText && (
                  <span className="text-slate-500">
                    · {document.fullText.length.toLocaleString('fr-FR')} caractères
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopy}
                className="h-7 text-xs text-slate-400 hover:text-white"
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

            {/* Zone de lecture — fond blanc, rendu document */}
            <div
              className="bg-white rounded-b-xl px-10 py-10"
              dir={isRtl ? 'rtl' : 'ltr'}
              style={{ fontSize: isRtl ? '17px' : '15.5px' }}
            >
              {document.fullText ? (
                renderLegalContent(document.fullText, isRtl)
              ) : (
                <p className="text-gray-400 italic text-center py-16">Aucun contenu disponible</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Panneau latéral (sidebar sticky) ── */}
        <div className="w-72 flex-shrink-0 space-y-4 sticky top-[72px]">
          {/* Informations */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-white text-sm">Informations</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Créé</span>
                <span className="text-slate-200" title={format(createdAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(createdAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Modifié</span>
                <span className="text-slate-200" title={format(updatedAt, 'PPpp', { locale: fr })}>
                  {formatDistanceToNow(updatedAt, { addSuffix: true, locale: fr })}
                </span>
              </div>
              {document.uploadedByEmail && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 flex-shrink-0">Par</span>
                  <span className="text-slate-200 truncate">{document.uploadedByEmail}</span>
                </div>
              )}
              {document.sourceFile && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-400 flex-shrink-0">Fichier</span>
                  <span
                    className="text-slate-200 truncate"
                    title={document.sourceFile}
                  >
                    {document.sourceFile.split('/').pop()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-400">RAG</span>
                <span className={document.ragEnabled ? 'text-green-400' : 'text-slate-500'}>
                  {document.ragEnabled ? 'Activé' : 'Désactivé'}
                </span>
              </div>
              {document.isAbroge && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Statut</span>
                  <span className="text-red-400">Abrogé</span>
                </div>
              )}
              {!document.isAbroge && document.abrogeSuspected && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Abrogation</span>
                  <span className="text-yellow-400">
                    Suspectée ({document.abrogeConfidence})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Métadonnées */}
          {Object.keys(document.metadata || {}).length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-white text-sm">Métadonnées</CardTitle>
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
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-white text-sm flex items-center justify-between">
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
                      <p className="text-xs text-slate-400 mb-1">Problèmes :</p>
                      <ul className="text-xs text-yellow-400 space-y-0.5">
                        {document.qualityDetectedIssues.slice(0, 3).map((issue, i) => (
                          <li key={i}>· {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-slate-400 text-xs">Analyse non effectuée</p>
              )}
            </CardContent>
          </Card>

          {/* Relations */}
          {relations.length > 0 && (
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-white text-sm">Relations</CardTitle>
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
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Supprimer ce document ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible. Le document &quot;{document.title}&quot; et tous ses chunks seront
              définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600">
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
