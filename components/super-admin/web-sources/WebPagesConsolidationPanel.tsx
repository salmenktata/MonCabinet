'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { consolidateSelectedWebPages } from '@/app/actions/legal-documents'

type DocumentType =
  | 'code'
  | 'loi'
  | 'decret'
  | 'arrete'
  | 'circulaire'
  | 'jurisprudence'
  | 'doctrine'
  | 'guide'
  | 'formulaire'
  | 'autre'

type ContributionType =
  | 'full_document'
  | 'article'
  | 'chapter'
  | 'section'
  | 'annex'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'En attente', color: 'bg-slate-500' },
  crawled: { label: 'Crawlée', color: 'bg-blue-500' },
  indexed: { label: 'Indexée', color: 'bg-green-500' },
  failed: { label: 'Erreur', color: 'bg-red-500' },
  unchanged: { label: 'Inchangée', color: 'bg-slate-400' },
  removed: { label: 'Supprimée', color: 'bg-orange-500' },
  blocked: { label: 'Bloquée', color: 'bg-yellow-500' },
}

export interface WebPageRow {
  id: string
  url: string
  title: string | null
  status: string
  is_indexed: boolean
  word_count: number
  chunks_count: number
  language_detected: string | null
  knowledge_base_id: string | null
  error_message: string | null
  last_crawled_at: string | null
}

interface WebPagesConsolidationPanelProps {
  pages: WebPageRow[]
  sourceId: string
  sourceName: string
  sourceCategory: string
  sourceBaseUrl: string
}

export default function WebPagesConsolidationPanel({
  pages,
  sourceId,
  sourceName,
  sourceCategory,
  sourceBaseUrl,
}: WebPagesConsolidationPanelProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Générer un slug depuis l'URL de la source
  let sourceSlug = ''
  try {
    sourceSlug = new URL(sourceBaseUrl).hostname.replace(/\./g, '-')
  } catch {
    sourceSlug = 'source'
  }

  const [citationKey, setCitationKey] = useState('')
  const [documentType, setDocumentType] = useState<DocumentType>('autre')
  const [titleAr, setTitleAr] = useState('')
  const [titleFr, setTitleFr] = useState('')
  const [contributionType, setContributionType] =
    useState<ContributionType>('full_document')

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === pages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pages.map((p) => p.id)))
    }
  }

  function handleOpenDialog() {
    // Auto-suggestion de citation key si vide
    if (!citationKey) {
      const ts = Date.now().toString(36)
      setCitationKey(`${sourceSlug}-${ts}`)
    }
    setDialogOpen(true)
  }

  function handleSubmit() {
    if (!citationKey.trim()) {
      toast.error('La clé de citation est requise')
      return
    }

    startTransition(async () => {
      const result = await consolidateSelectedWebPages(
        Array.from(selectedIds),
        sourceId,
        {
          citationKey: citationKey.trim(),
          documentType,
          titleAr: titleAr.trim() || undefined,
          titleFr: titleFr.trim() || undefined,
          contributionType,
          sourceCategory,
        }
      )

      if (result.success && result.documentId) {
        toast.success(
          `Document consolidé créé avec ${result.totalPages ?? 0} pages`
        )
        setDialogOpen(false)
        setSelectedIds(new Set())
        router.push(`/super-admin/legal-documents/${result.documentId}`)
      } else {
        toast.error(result.error || 'Erreur lors de la consolidation')
      }
    })
  }

  const allSelected = pages.length > 0 && selectedIds.size === pages.length

  return (
    <>
      {/* En-tête de sélection */}
      {pages.length > 0 && (
        <div className="flex items-center gap-2 py-2 px-1 border-b border-slate-700 mb-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleSelectAll}
            className="border-slate-500"
          />
          <span className="text-sm text-slate-400">
            {selectedIds.size > 0
              ? `${selectedIds.size} page(s) sélectionnée(s)`
              : 'Sélectionner tout'}
          </span>
        </div>
      )}

      {/* Liste des pages */}
      {pages.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Icons.fileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Aucune page trouvée</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <PageCheckRow
              key={page.id}
              page={page}
              selected={selectedIds.has(page.id)}
              onToggle={() => toggleSelect(page.id)}
            />
          ))}
        </div>
      )}

      {/* Barre flottante d'actions */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 shadow-2xl">
            <span className="text-sm text-white font-medium">
              {selectedIds.size} page(s)
            </span>
            <Button
              size="sm"
              onClick={handleOpenDialog}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Icons.fileText className="h-4 w-4 mr-2" />
              Consolider
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400 hover:text-white"
            >
              <Icons.x className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialog de création du document */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              Créer un document consolidé
            </DialogTitle>
            <p className="text-sm text-slate-400">
              {selectedIds.size} pages sélectionnées depuis {sourceName}
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label className="text-slate-300">Clé de citation *</Label>
              <Input
                value={citationKey}
                onChange={(e) => setCitationKey(e.target.value)}
                placeholder="ex: code-travail-tunisien"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
              <p className="text-xs text-slate-500">
                Identifiant unique du document (lettres minuscules et tirets)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-slate-300">Type de document</Label>
                <Select
                  value={documentType}
                  onValueChange={(v) => setDocumentType(v as DocumentType)}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {[
                      { value: 'code', label: 'Code' },
                      { value: 'loi', label: 'Loi' },
                      { value: 'decret', label: 'Décret' },
                      { value: 'arrete', label: 'Arrêté' },
                      { value: 'circulaire', label: 'Circulaire' },
                      { value: 'jurisprudence', label: 'Jurisprudence' },
                      { value: 'doctrine', label: 'Doctrine' },
                      { value: 'guide', label: 'Guide' },
                      { value: 'formulaire', label: 'Formulaire' },
                      { value: 'autre', label: 'Autre' },
                    ].map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-white hover:bg-slate-700"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-slate-300">Contribution</Label>
                <Select
                  value={contributionType}
                  onValueChange={(v) =>
                    setContributionType(v as ContributionType)
                  }
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    {[
                      { value: 'full_document', label: 'Document complet' },
                      { value: 'article', label: 'Article' },
                      { value: 'chapter', label: 'Chapitre' },
                      { value: 'section', label: 'Section' },
                      { value: 'annex', label: 'Annexe' },
                    ].map((opt) => (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-white hover:bg-slate-700"
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300">Titre en arabe (optionnel)</Label>
              <Input
                value={titleAr}
                onChange={(e) => setTitleAr(e.target.value)}
                placeholder="العنوان الرسمي"
                dir="rtl"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-slate-300">Titre en français (optionnel)</Label>
              <Input
                value={titleFr}
                onChange={(e) => setTitleFr(e.target.value)}
                placeholder="Titre officiel français"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
              className="text-slate-400 hover:text-white"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isPending || !citationKey.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isPending ? (
                <>
                  <Icons.spinner className="h-4 w-4 mr-2 animate-spin" />
                  Consolidation...
                </>
              ) : (
                <>
                  <Icons.fileText className="h-4 w-4 mr-2" />
                  Créer et consolider
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// =============================================================================
// Composant ligne de page avec checkbox
// =============================================================================

interface PageCheckRowProps {
  page: WebPageRow
  selected: boolean
  onToggle: () => void
}

function PageCheckRow({ page, selected, onToggle }: PageCheckRowProps) {
  const statusInfo = STATUS_LABELS[page.status] || {
    label: page.status,
    color: 'bg-slate-500',
  }

  return (
    <div
      className={`rounded-lg p-4 transition-colors cursor-pointer ${
        selected
          ? 'bg-blue-900/20 border border-blue-500/30'
          : 'bg-slate-700/50 hover:bg-slate-700/70'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-1 border-slate-500"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge className={`${statusInfo.color} text-white text-xs`}>
              {statusInfo.label}
            </Badge>
            {page.is_indexed && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                <Icons.checkCircle className="h-3 w-3 mr-1" />
                Indexée
              </Badge>
            )}
            {page.language_detected && (
              <Badge
                variant="outline"
                className="text-xs border-slate-600 text-slate-400"
              >
                {page.language_detected.toUpperCase()}
              </Badge>
            )}
            {page.knowledge_base_id && (
              <a
                href={`/super-admin/knowledge-base/${page.knowledge_base_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
                title="Voir le document dans la KB"
              >
                Voir KB
              </a>
            )}
          </div>
          <h3 className="text-white font-medium truncate">
            {page.title || 'Sans titre'}
          </h3>
          <a
            href={page.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-400 text-sm hover:text-blue-400 truncate block"
          >
            {page.url}
          </a>
          {page.error_message && (
            <p className="text-red-400 text-xs mt-1 truncate">
              <Icons.alertTriangle className="h-3 w-3 inline mr-1" />
              {page.error_message}
            </p>
          )}
        </div>
        <div className="text-right text-sm text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            {page.word_count > 0 && (
              <span title="Mots">{page.word_count.toLocaleString()} mots</span>
            )}
            {page.chunks_count > 0 && (
              <span title="Chunks RAG">{page.chunks_count} chunks</span>
            )}
          </div>
          {page.last_crawled_at && (
            <p className="text-xs mt-1">
              {new Date(page.last_crawled_at).toLocaleDateString('fr-FR')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
