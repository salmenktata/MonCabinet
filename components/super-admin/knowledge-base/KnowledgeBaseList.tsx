'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
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
import {
  indexKnowledgeDocumentAction,
  deleteKnowledgeDocumentAction,
  bulkKnowledgeDocumentAction
} from '@/app/actions/knowledge-base'
import { CategoryBadge } from './CategorySelector'
import { TagsList } from './TagsInput'
import { QualityIndicator } from './QualityIndicator'
import { AbrogationBadge } from './AbrogationBadge'

interface Document {
  id: string
  title: string
  description: string
  category: string
  subcategory?: string | null
  language: string
  tags?: string[]
  is_indexed: boolean
  is_approved: boolean
  chunk_count: number
  version?: number
  file_name: string
  file_type: string
  uploaded_by_email: string
  created_at: Date
  quality_score?: number | null
  quality_requires_review?: boolean
  is_abroge?: boolean | null
  abroge_suspected?: boolean | null
  abroge_confidence?: 'low' | 'medium' | 'high' | null
}

interface KnowledgeBaseListProps {
  documents: Document[]
  currentPage: number
  totalPages: number
  category: string
  subcategory?: string
  indexed: string
  approved: string
  search: string
  abroge?: string
}

export function KnowledgeBaseList({
  documents,
  currentPage,
  totalPages,
  category,
  subcategory = '',
  indexed,
  approved,
  search,
  abroge = 'all',
}: KnowledgeBaseListProps) {
  const router = useRouter()

  const [loading, setLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const handleIndex = async (id: string) => {
    setLoading(id)
    try {
      const result = await indexKnowledgeDocumentAction(id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Document index\u00e9 \u2014 ${result.chunksCreated} chunks cr\u00e9\u00e9s`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de l\'indexation')
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setLoading(deleteId)
    try {
      const result = await deleteKnowledgeDocumentAction(deleteId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Document supprim\u00e9')
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de la suppression')
    } finally {
      setLoading(null)
      setDeleteId(null)
    }
  }

  // Actions groupées
  const handleBulkAction = async (action: 'delete' | 'index' | 'approve' | 'revoke_approval') => {
    if (selectedIds.size === 0) return

    setBulkLoading(true)
    try {
      const result = await bulkKnowledgeDocumentAction(action, Array.from(selectedIds))
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(`Action effectu\u00e9e \u2014 ${result.summary?.succeeded}/${result.summary?.total} documents trait\u00e9s`)
        setSelectedIds(new Set())
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de l\'action group\u00e9e')
    } finally {
      setBulkLoading(false)
    }
  }

  // Actions abrogation bulk
  const handleBulkAbrogation = async (confirm: boolean) => {
    if (selectedIds.size === 0) return

    setBulkLoading(true)
    const ids = Array.from(selectedIds)
    let succeeded = 0
    let failed = 0

    try {
      await Promise.allSettled(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/admin/knowledge-base/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_abroge: confirm }),
            })
            if (res.ok) succeeded++
            else failed++
          } catch {
            failed++
          }
        })
      )

      if (failed === 0) {
        toast.success(`${confirm ? 'Abrogation confirmée' : 'Suspicion rejetée'} — ${succeeded} document(s)`)
      } else {
        toast.warning(`${succeeded} réussi(s), ${failed} échec(s)`)
      }
      setSelectedIds(new Set())
      router.refresh()
    } catch {
      toast.error('Erreur lors de l\'action abrogation')
    } finally {
      setBulkLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === documents.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documents.map(d => d.id)))
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Icons.bookOpen className="h-12 w-12 mx-auto mb-4" />
        <p>Aucun document trouvé</p>
      </div>
    )
  }

  const buildUrl = (params: Record<string, string | number>) => {
    const base = '/super-admin/knowledge-base'
    const searchParams = new URLSearchParams()
    if (category) searchParams.set('category', category)
    if (subcategory) searchParams.set('subcategory', subcategory)
    if (indexed) searchParams.set('indexed', indexed)
    if (approved) searchParams.set('approved', approved)
    if (search) searchParams.set('search', search)
    if (abroge && abroge !== 'all') searchParams.set('abroge', abroge)
    Object.entries(params).forEach(([key, val]) => {
      if (val) searchParams.set(key, String(val))
    })
    return `${base}?${searchParams.toString()}`
  }

  return (
    <>
      {/* Actions groupées */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 mb-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-sm text-blue-300">
            {selectedIds.size} document(s) sélectionné(s)
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('approve')}
              disabled={bulkLoading}
              className="border-green-500/30 text-green-400"
            >
              {bulkLoading ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Icons.checkCircle className="h-4 w-4 mr-1" />
                  Approuver
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('revoke_approval')}
              disabled={bulkLoading}
              className="border-orange-500/30 text-orange-400"
            >
              <Icons.shield className="h-4 w-4 mr-1" />
              Révoquer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('index')}
              disabled={bulkLoading}
              className="border-blue-500/30 text-blue-400"
            >
              <Icons.zap className="h-4 w-4 mr-1" />
              Indexer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAction('delete')}
              disabled={bulkLoading}
              className="border-red-500/30 text-red-400"
            >
              <Icons.trash className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAbrogation(true)}
              disabled={bulkLoading}
              className="border-red-500/30 text-red-400"
              title="Marquer comme abrogés — retire du RAG"
            >
              Confirmer abrogation
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleBulkAbrogation(false)}
              disabled={bulkLoading}
              className="border-slate-500/30 text-slate-400"
              title="Rejeter la suspicion d'abrogation"
            >
              Rejeter suspicion
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds(new Set())}
              className="text-slate-400"
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* En-tête avec sélection globale */}
      <div className="flex items-center gap-3 mb-3 px-2">
        <Checkbox
          checked={selectedIds.size === documents.length && documents.length > 0}
          onCheckedChange={toggleSelectAll}
          className="border-slate-500"
          aria-label="Sélectionner tous les documents"
        />
        <span className="text-sm text-slate-400">
          {documents.length} document(s)
        </span>
      </div>

      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`flex items-start gap-4 p-4 rounded-lg transition ${
              selectedIds.has(doc.id)
                ? 'bg-blue-500/10 border border-blue-500/30'
                : 'bg-slate-700/50 hover:bg-slate-700/70'
            }`}
          >
            <Checkbox
              checked={selectedIds.has(doc.id)}
              onCheckedChange={() => toggleSelect(doc.id)}
              className="mt-2 border-slate-500"
              aria-label={`Sélectionner ${doc.title}`}
            />

            <Link
              href={`/super-admin/knowledge-base/${doc.id}`}
              aria-label="Voir le document"
              className="h-10 w-10 rounded-lg bg-slate-600 flex items-center justify-center shrink-0 hover:bg-slate-500 transition"
            >
              <Icons.fileText className="h-5 w-5 text-slate-300" />
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/super-admin/knowledge-base/${doc.id}`}
                  className="font-medium text-white hover:text-blue-400 transition"
                >
                  {doc.title}
                </Link>
                {doc.version && doc.version > 1 && (
                  <span className="text-xs text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded">
                    v{doc.version}
                  </span>
                )}
                <CategoryBadge
                  category={doc.category}
                  subcategory={doc.subcategory}
                  size="xs"
                />
                <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                  {doc.language === 'ar' ? 'العربية' : 'FR'}
                </Badge>
                {doc.is_indexed ? (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                    <Icons.checkCircle className="h-3 w-3 mr-1" />
                    {doc.chunk_count} chunks
                  </Badge>
                ) : (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                    Non indexé
                  </Badge>
                )}
                {doc.is_approved ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    <Icons.shield className="h-3 w-3 mr-1" />
                    Approuvé
                  </Badge>
                ) : (
                  <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs">
                    En attente
                  </Badge>
                )}
                <QualityIndicator
                  score={doc.quality_score ?? null}
                  requiresReview={doc.quality_requires_review}
                  size="xs"
                  showTooltip={false}
                />
                <AbrogationBadge
                  isAbroge={doc.is_abroge}
                  abrogeSuspected={doc.abroge_suspected}
                  abrogeConfidence={doc.abroge_confidence}
                />
              </div>

              {doc.description && (
                <p className="text-sm text-slate-400 mt-1 line-clamp-1">
                  {doc.description}
                </p>
              )}

              {doc.tags && doc.tags.length > 0 && (
                <div className="mt-1.5">
                  <TagsList tags={doc.tags.slice(0, 5)} size="xs" />
                </div>
              )}

              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                {doc.file_name && (
                  <span className="flex items-center gap-1">
                    <Icons.attachment className="h-3 w-3" />
                    {doc.file_name}
                  </span>
                )}
                <span>
                  {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                </span>
                {doc.uploaded_by_email && (
                  <span>{doc.uploaded_by_email}</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {/* Voir */}
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-600"
                title="Voir détail"
                asChild
              >
                <Link href={`/super-admin/knowledge-base/${doc.id}`}>
                  <Icons.eye className="h-4 w-4" />
                </Link>
              </Button>

              {/* Modifier */}
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-white hover:bg-slate-600"
                title="Modifier"
                asChild
              >
                <Link href={`/super-admin/knowledge-base/${doc.id}/edit`}>
                  <Icons.edit className="h-4 w-4" />
                </Link>
              </Button>

              {/* Indexer */}
              <Button
                size="sm"
                variant={doc.is_indexed ? "outline" : "default"}
                onClick={() => handleIndex(doc.id)}
                disabled={loading === doc.id}
                className={doc.is_indexed
                  ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                  : "bg-blue-600 hover:bg-blue-700 text-white"}
                title={doc.is_indexed ? "Réindexer" : "Indexer"}
              >
                {loading === doc.id ? (
                  <Icons.loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.zap className="h-4 w-4" />
                )}
              </Button>

              {/* Supprimer */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteId(doc.id)}
                className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                title="Supprimer"
              >
                <Icons.trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Link href={buildUrl({ page: Math.max(1, currentPage - 1) })} aria-label="Page précédente">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              className="border-slate-600 text-slate-300"
            >
              <Icons.chevronLeft className="h-4 w-4" />
            </Button>
          </Link>

          <span className="text-sm text-slate-400">
            Page {currentPage} / {totalPages}
          </span>

          <Link href={buildUrl({ page: Math.min(totalPages, currentPage + 1) })} aria-label="Page suivante">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              className="border-slate-600 text-slate-300"
            >
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}

      {/* Dialog de confirmation suppression */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible. Le document et tous ses chunks seront supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
