'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  indexKnowledgeDocumentAction,
  deleteKnowledgeDocumentAction,
  bulkKnowledgeDocumentAction
} from '@/app/actions/knowledge-base'
import { CategoryBadge } from './CategorySelector'
import { TagsList } from './TagsInput'
import { QualityIndicator } from './QualityIndicator'

interface Document {
  id: string
  title: string
  description: string
  category: string
  subcategory?: string | null
  language: string
  tags?: string[]
  is_indexed: boolean
  chunk_count: number
  version?: number
  file_name: string
  file_type: string
  uploaded_by_email: string
  created_at: Date
  quality_score?: number | null
  quality_requires_review?: boolean
}

interface KnowledgeBaseListProps {
  documents: Document[]
  currentPage: number
  totalPages: number
  category: string
  subcategory?: string
  indexed: string
  search: string
}

export function KnowledgeBaseList({
  documents,
  currentPage,
  totalPages,
  category,
  subcategory = '',
  indexed,
  search
}: KnowledgeBaseListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const handleIndex = async (id: string) => {
    setLoading(id)
    try {
      const result = await indexKnowledgeDocumentAction(id)
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Document indexé',
          description: `${result.chunksCreated} chunks créés`
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'indexation',
        variant: 'destructive'
      })
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
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Document supprimé',
          description: 'Le document a été supprimé'
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive'
      })
    } finally {
      setLoading(null)
      setDeleteId(null)
    }
  }

  // Actions groupées
  const handleBulkAction = async (action: 'delete' | 'index') => {
    if (selectedIds.size === 0) return

    setBulkLoading(true)
    try {
      const result = await bulkKnowledgeDocumentAction(action, Array.from(selectedIds))
      if (result.error) {
        toast({
          title: 'Erreur',
          description: result.error,
          variant: 'destructive'
        })
      } else {
        toast({
          title: 'Action effectuée',
          description: `${result.summary?.succeeded}/${result.summary?.total} documents traités`
        })
        setSelectedIds(new Set())
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'action groupée',
        variant: 'destructive'
      })
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
    if (search) searchParams.set('search', search)
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
              onClick={() => handleBulkAction('index')}
              disabled={bulkLoading}
              className="border-blue-500/30 text-blue-400"
            >
              {bulkLoading ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Icons.zap className="h-4 w-4 mr-1" />
                  Indexer
                </>
              )}
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
                <QualityIndicator
                  score={doc.quality_score ?? null}
                  requiresReview={doc.quality_requires_review}
                  size="xs"
                  showTooltip={false}
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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleIndex(doc.id)}
                disabled={loading === doc.id}
                className={doc.is_indexed
                  ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                  : "text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"}
                title={doc.is_indexed ? "Réindexer" : "Indexer"}
              >
                {loading === doc.id ? (
                  <Icons.loader className="h-4 w-4 animate-spin" />
                ) : (
                  <Icons.zap className="h-4 w-4" />
                )}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-white"
                  >
                    <Icons.moreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/super-admin/knowledge-base/${doc.id}`}
                      className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Icons.eye className="h-4 w-4 mr-2" />
                      Voir détail
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/super-admin/knowledge-base/${doc.id}/edit`}
                      className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Icons.edit className="h-4 w-4 mr-2" />
                      Modifier
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleIndex(doc.id)}
                    className={doc.is_indexed
                      ? "text-amber-400 hover:bg-slate-700 cursor-pointer"
                      : "text-blue-400 hover:bg-slate-700 cursor-pointer"}
                  >
                    <Icons.zap className="h-4 w-4 mr-2" />
                    {doc.is_indexed ? 'Réindexer' : 'Indexer'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem
                    onClick={() => setDeleteId(doc.id)}
                    className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Icons.trash className="h-4 w-4 mr-2" />
                    Supprimer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Link href={buildUrl({ page: Math.max(1, currentPage - 1) })}>
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

          <Link href={buildUrl({ page: Math.min(totalPages, currentPage + 1) })}>
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
