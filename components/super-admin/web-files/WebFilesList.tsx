'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

interface WebFile {
  id: string
  webPageId: string
  webSourceId: string
  knowledgeBaseId: string | null
  url: string
  filename: string
  fileType: string
  fileSize: number
  isDownloaded: boolean
  isIndexed: boolean
  downloadError: string | null
  parseError: string | null
  chunksCount: number
  wordCount: number
  downloadedAt: string | null
  indexedAt: string | null
  createdAt: string
  status: 'pending' | 'downloaded' | 'indexed' | 'error'
  sourceName: string
  pageUrl: string
  pageTitle: string | null
}

interface WebSource {
  id: string
  name: string
}

interface WebFilesListProps {
  sources?: WebSource[]
}

const STATUS_CONFIG = {
  pending: { label: 'En attente', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
  downloaded: { label: 'Téléchargé', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  indexed: { label: 'Indexé', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  error: { label: 'Erreur', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

const FILE_TYPE_ICONS: Record<string, keyof typeof Icons> = {
  pdf: 'fileText',
  docx: 'file',
  doc: 'file',
  image: 'image',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatDate(date: string | null): string {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function WebFilesList({ sources = [] }: WebFilesListProps) {
  const router = useRouter()
  const [files, setFiles] = useState<WebFile[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteFile, setDeleteFile] = useState<WebFile | null>(null)

  // Filters
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [stats, setStats] = useState({
    totalFiles: 0,
    totalSize: 0,
    byType: {} as Record<string, number>,
    byStatus: { pending: 0, downloaded: 0, indexed: 0, error: 0 },
  })

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      })

      if (sourceFilter) params.set('source_id', sourceFilter)
      if (typeFilter) params.set('file_type', typeFilter)
      if (statusFilter) params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/admin/web-files?${params}`)
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erreur chargement')
      }

      setFiles(data.files || [])
      setPagination(data.pagination)
      setStats(data.stats || {
        totalFiles: 0,
        totalSize: 0,
        byType: {},
        byStatus: { pending: 0, downloaded: 0, indexed: 0, error: 0 },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur chargement fichiers')
    } finally {
      setLoading(false)
    }
  }, [page, sourceFilter, typeFilter, statusFilter, search])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleReindex = async (file: WebFile) => {
    setActionLoading(file.id)
    try {
      const res = await fetch(`/api/admin/web-files/${file.id}`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Erreur réindexation')
      }

      toast.success(`Fichier réindexé — ${data.chunksCreated} chunks créés`)
      fetchFiles()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur réindexation')
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteFile) return

    setActionLoading(deleteFile.id)
    try {
      const res = await fetch(`/api/admin/web-files/${deleteFile.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Erreur suppression')
      }

      toast.success('Fichier supprimé')
      fetchFiles()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur suppression')
    } finally {
      setActionLoading(null)
      setDeleteFile(null)
    }
  }

  const handleDownload = (file: WebFile) => {
    window.open(file.url, '_blank')
  }

  const clearFilters = () => {
    setSourceFilter('')
    setTypeFilter('')
    setStatusFilter('')
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  const hasFilters = sourceFilter || typeFilter || statusFilter || search

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
          <p className="text-xs text-slate-400 mb-1">Total fichiers</p>
          <p className="text-2xl font-bold text-white">{stats.totalFiles}</p>
          <p className="text-xs text-slate-400 mt-1">{formatFileSize(stats.totalSize)}</p>
        </div>
        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/20">
          <p className="text-xs text-green-400 mb-1">Indexés</p>
          <p className="text-2xl font-bold text-green-400">{stats.byStatus.indexed}</p>
          <p className="text-xs text-green-400 mt-1">
            {stats.totalFiles > 0 ? Math.round((stats.byStatus.indexed / stats.totalFiles) * 100) : 0}%
          </p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/20">
          <p className="text-xs text-blue-400 mb-1">Téléchargés</p>
          <p className="text-2xl font-bold text-blue-400">{stats.byStatus.downloaded}</p>
        </div>
        <div className="bg-slate-500/10 rounded-lg p-4 border border-slate-500/20">
          <p className="text-xs text-slate-400 mb-1">En attente</p>
          <p className="text-2xl font-bold text-slate-400">{stats.byStatus.pending}</p>
        </div>
        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/20">
          <p className="text-xs text-red-400 mb-1">Erreurs</p>
          <p className="text-2xl font-bold text-red-400">{stats.byStatus.error}</p>
        </div>
      </div>

      {/* Types breakdown */}
      {Object.keys(stats.byType).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.byType).map(([type, count]) => (
            <Badge
              key={type}
              variant="outline"
              className="border-slate-600 text-slate-300"
            >
              {type.toUpperCase()}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Icons.search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Rechercher un fichier..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-400"
          />
        </div>

        <Select value={sourceFilter || 'all'} onValueChange={(v) => { setSourceFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[180px] bg-slate-800 border-slate-700 text-white" aria-label="Filtrer par source">
            <SelectValue placeholder="Toutes les sources" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200">Toutes les sources</SelectItem>
            {sources.map((source) => (
              <SelectItem key={source.id} value={source.id} className="text-slate-200">
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={typeFilter || 'all'} onValueChange={(v) => { setTypeFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white" aria-label="Filtrer par type">
            <SelectValue placeholder="Tous types" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200">Tous types</SelectItem>
            <SelectItem value="pdf" className="text-slate-200">PDF</SelectItem>
            <SelectItem value="docx" className="text-slate-200">DOCX</SelectItem>
            <SelectItem value="doc" className="text-slate-200">DOC</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-white" aria-label="Filtrer par état">
            <SelectValue placeholder="Tous états" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-200">Tous états</SelectItem>
            <SelectItem value="indexed" className="text-green-400">Indexé</SelectItem>
            <SelectItem value="downloaded" className="text-blue-400">Téléchargé</SelectItem>
            <SelectItem value="pending" className="text-slate-400">En attente</SelectItem>
            <SelectItem value="error" className="text-red-400">Erreur</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-slate-400 hover:text-white"
          >
            <Icons.x className="h-4 w-4 mr-1" />
            Effacer
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchFiles()}
          disabled={loading}
          className="border-slate-600 text-slate-300"
        >
          <Icons.refresh className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* Loading state */}
      {loading && files.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Icons.loader className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && files.length === 0 && (
        <div className="text-center py-12 text-slate-400 bg-slate-800/30 rounded-lg">
          <Icons.file className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg">Aucun fichier trouvé</p>
          {hasFilters && (
            <p className="text-sm mt-1">
              Essayez de modifier vos filtres
            </p>
          )}
        </div>
      )}

      {/* Table */}
      {files.length > 0 && (
        <div className="overflow-x-auto bg-slate-800/30 rounded-lg border border-slate-700">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Fichier</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Source</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Type</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Taille</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">État</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Chunks</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-slate-400">Date</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const statusConfig = STATUS_CONFIG[file.status]
                const IconComponent = Icons[FILE_TYPE_ICONS[file.fileType] || 'file']

                return (
                  <tr
                    key={file.id}
                    className="border-b border-slate-800 hover:bg-slate-800/50 transition"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <IconComponent className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm text-white truncate max-w-[250px]" title={file.filename}>
                            {file.filename}
                          </p>
                          {(file.downloadError || file.parseError) && (
                            <p className="text-xs text-red-400 truncate max-w-[250px]">
                              {file.downloadError || file.parseError}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/super-admin/web-sources/${file.webSourceId}`}
                        className="text-sm text-blue-400 hover:underline truncate max-w-[150px] block"
                      >
                        {file.sourceName}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-400 uppercase">{file.fileType}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-300">{formatFileSize(file.fileSize)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge className={statusConfig.color + ' text-xs'}>
                        {statusConfig.label}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-slate-300">
                        {file.chunksCount > 0 ? file.chunksCount : '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-slate-400">
                        {formatDate(file.indexedAt || file.downloadedAt || file.createdAt)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={actionLoading === file.id}
                            className="h-8 w-8 p-0"
                            aria-label="Options du fichier"
                          >
                            {actionLoading === file.id ? (
                              <Icons.loader className="h-4 w-4 animate-spin" />
                            ) : (
                              <Icons.moreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                          <DropdownMenuItem
                            onClick={() => handleDownload(file)}
                            className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                          >
                            <Icons.download className="h-4 w-4 mr-2" />
                            Télécharger
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => router.push(`/super-admin/web-sources/${file.webSourceId}/files`)}
                            className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                          >
                            <Icons.folder className="h-4 w-4 mr-2" />
                            Voir la source
                          </DropdownMenuItem>
                          {file.isDownloaded && (
                            <DropdownMenuItem
                              onClick={() => handleReindex(file)}
                              className="text-purple-400 hover:bg-slate-700 cursor-pointer"
                            >
                              <Icons.refresh className="h-4 w-4 mr-2" />
                              Réindexer
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setDeleteFile(file)}
                            className="text-red-400 hover:bg-red-500/10 cursor-pointer"
                          >
                            <Icons.trash className="h-4 w-4 mr-2" />
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Page {pagination.page} sur {pagination.totalPages} ({pagination.total} fichiers)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="border-slate-600"
              aria-label="Page précédente"
            >
              <Icons.chevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages || loading}
              className="border-slate-600"
              aria-label="Page suivante"
            >
              <Icons.chevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteFile} onOpenChange={() => setDeleteFile(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le fichier ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Le fichier "{deleteFile?.filename}" sera supprimé du stockage et de l'index.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={actionLoading === deleteFile?.id}
            >
              {actionLoading === deleteFile?.id && (
                <Icons.loader className="h-4 w-4 animate-spin mr-2" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
