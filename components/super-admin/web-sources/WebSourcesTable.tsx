'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import { getCategoryLabel, CATEGORY_COLORS } from '@/lib/web-scraper/category-labels'
import type { WebSourceCategory } from '@/lib/web-scraper/types'
import { HealthBadge } from './HealthBadge'
import { IndexationProgress } from './IndexationProgress'
import { formatRelativeTime, getSourceType } from './utils'
import type { WebSourceListItem, SortField, SortDirection } from './types'
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

interface WebSourcesTableProps {
  sources: WebSourceListItem[]
  currentPage: number
  totalPages: number
  totalCount: number
  category: string
  status: string
  search: string
  language: string
  sortBy: string
  sortDir: string
  view: string
  readOnly?: boolean
}

export function WebSourcesTable({
  sources,
  currentPage,
  totalPages,
  totalCount,
  category,
  status,
  search,
  language,
  sortBy,
  sortDir,
  view,
  readOnly = false,
}: WebSourcesTableProps) {
  const router = useRouter()
  const locale = useLocale() as 'fr' | 'ar'
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)

  const limit = 20
  const startItem = (currentPage - 1) * limit + 1
  const endItem = Math.min(currentPage * limit, totalCount)

  // Selection
  const allSelected = sources.length > 0 && selectedIds.size === sources.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < sources.length

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sources.map(s => s.id)))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Actions
  const handleCrawl = async (id: string) => {
    setLoading(id)
    try {
      const res = await fetch(`/api/admin/web-sources/${id}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType: 'incremental', async: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Erreur lors du crawl', variant: 'destructive' })
      } else {
        toast({ title: 'Crawl lance', description: data.async ? 'Job ajoute a la queue' : `${data.crawl?.pagesProcessed} pages traitees` })
        router.refresh()
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du crawl', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setLoading(id)
    try {
      const res = await fetch(`/api/admin/web-sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Erreur', description: data.error || 'Erreur lors de la mise a jour', variant: 'destructive' })
      } else {
        toast({ title: isActive ? 'Source desactivee' : 'Source activee' })
        router.refresh()
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la mise a jour', variant: 'destructive' })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setLoading(deleteId)
    try {
      const res = await fetch(`/api/admin/web-sources/${deleteId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.message || data.error || 'Erreur', variant: 'destructive', duration: 10000 })
      } else {
        const stats = data.stats
        toast({ title: 'Source supprimee', description: stats ? `${stats.webPages} pages, ${stats.knowledgeBaseDocs} docs KB supprimes` : 'Donnees supprimees' })
        router.refresh()
      }
    } catch (err) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur', variant: 'destructive' })
    } finally {
      setLoading(null)
      setDeleteId(null)
    }
  }

  // Bulk actions
  const handleBulkAction = async (action: 'crawl' | 'activate' | 'deactivate') => {
    if (selectedIds.size === 0) return
    setBulkLoading(true)
    try {
      const res = await fetch('/api/admin/web-sources/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sourceIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Erreur bulk', variant: 'destructive' })
      } else {
        const labels = { crawl: 'Crawls lances', activate: 'Sources activees', deactivate: 'Sources desactivees' }
        toast({ title: labels[action], description: `${data.success} reussi(s)${data.failed > 0 ? `, ${data.failed} echec(s)` : ''}` })
        setSelectedIds(new Set())
        router.refresh()
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de l\'operation bulk', variant: 'destructive' })
    } finally {
      setBulkLoading(false)
    }
  }

  // URL builder
  const buildUrl = useCallback((params: Record<string, string | number>) => {
    const searchParams = new URLSearchParams()
    if (category) searchParams.set('category', category)
    if (status) searchParams.set('status', status)
    if (search) searchParams.set('search', search)
    if (language) searchParams.set('language', language)
    if (sortBy) searchParams.set('sortBy', sortBy)
    if (sortDir) searchParams.set('sortDir', sortDir)
    if (view) searchParams.set('view', view)
    Object.entries(params).forEach(([key, val]) => {
      if (val) searchParams.set(key, String(val))
    })
    return `/super-admin/web-sources?${searchParams.toString()}`
  }, [category, status, search, language, sortBy, sortDir, view])

  const handleSort = (field: SortField) => {
    const newDir: SortDirection = sortBy === field && sortDir !== 'asc' ? 'asc' : 'desc'
    const searchParams = new URLSearchParams()
    if (category) searchParams.set('category', category)
    if (status) searchParams.set('status', status)
    if (search) searchParams.set('search', search)
    if (language) searchParams.set('language', language)
    if (view) searchParams.set('view', view)
    searchParams.set('sortBy', field)
    searchParams.set('sortDir', newDir)
    router.push(`/super-admin/web-sources?${searchParams.toString()}`)
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <Icons.arrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sortDir === 'asc'
      ? <Icons.arrowUp className="h-3 w-3 ml-1" />
      : <Icons.arrowDown className="h-3 w-3 ml-1" />
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400 bg-slate-800/50 rounded-lg">
        <Icons.globe className="h-12 w-12 mx-auto mb-4" />
        <p>Aucune source trouvee</p>
        {!readOnly && (
          <Link href="/super-admin/web-sources/new">
            <Button className="mt-4 bg-blue-600 hover:bg-blue-700">Ajouter une source</Button>
          </Link>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Bulk toolbar */}
      {selectedIds.size > 0 && !readOnly && (
        <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg mb-4">
          <span className="text-sm text-blue-300 font-medium">
            {selectedIds.size} selectionne{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="h-4 w-px bg-blue-500/30" />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleBulkAction('crawl')}
            disabled={bulkLoading}
            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
          >
            <Icons.refresh className="h-3.5 w-3.5 mr-1.5" />
            Crawler
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleBulkAction('activate')}
            disabled={bulkLoading}
            className="text-green-400 hover:text-green-300 hover:bg-green-500/20"
          >
            <Icons.play className="h-3.5 w-3.5 mr-1.5" />
            Activer
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleBulkAction('deactivate')}
            disabled={bulkLoading}
            className="text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/20"
          >
            <Icons.pause className="h-3.5 w-3.5 mr-1.5" />
            Desactiver
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
            className="text-slate-400 hover:text-white ml-auto"
          >
            <Icons.close className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-700 bg-slate-800/50 hover:bg-slate-800/50">
              {!readOnly && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) (el as unknown as HTMLInputElement).indeterminate = someSelected
                    }}
                    onCheckedChange={toggleAll}
                    className="border-slate-600"
                  />
                </TableHead>
              )}
              <TableHead className="w-[80px] text-slate-400">Sante</TableHead>
              <TableHead className="text-slate-400">
                <button onClick={() => handleSort('name')} className="flex items-center hover:text-white transition">
                  Source <SortIcon field="name" />
                </button>
              </TableHead>
              <TableHead className="text-slate-400 w-[140px]">Categorie</TableHead>
              <TableHead className="text-slate-400 w-[180px]">
                <button onClick={() => handleSort('pages_count')} className="flex items-center hover:text-white transition">
                  Pages <SortIcon field="pages_count" />
                </button>
              </TableHead>
              <TableHead className="text-slate-400 w-[130px]">
                <button onClick={() => handleSort('last_crawl_at')} className="flex items-center hover:text-white transition">
                  Dernier crawl <SortIcon field="last_crawl_at" />
                </button>
              </TableHead>
              <TableHead className="text-slate-400 w-[120px]">Prochain</TableHead>
              <TableHead className="text-slate-400 w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => {
              const sourceType = getSourceType(source.drive_config)
              return (
                <TableRow key={source.id} className="border-slate-700/50 hover:bg-slate-800/30">
                  {!readOnly && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(source.id)}
                        onCheckedChange={() => toggleOne(source.id)}
                        className="border-slate-600"
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <HealthBadge status={source.health_status} consecutiveFailures={source.consecutive_failures} size="sm" />
                  </TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        {sourceType === 'gdrive' ? (
                          <Icons.cloud className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        ) : (
                          <Icons.globe className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                        )}
                        <Link
                          href={`/super-admin/web-sources/${source.id}`}
                          className="font-medium text-white hover:text-blue-400 transition truncate"
                        >
                          {source.name}
                        </Link>
                        {!source.is_active && (
                          <Badge variant="outline" className="border-slate-600 text-slate-500 text-[10px] px-1 py-0">
                            OFF
                          </Badge>
                        )}
                      </div>
                      <a
                        href={source.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-slate-500 hover:text-blue-400 truncate block max-w-[300px]"
                      >
                        {source.base_url}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${CATEGORY_COLORS[source.category] || CATEGORY_COLORS.autre} text-[11px]`}>
                      {getCategoryLabel(source.category as WebSourceCategory, locale)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <IndexationProgress
                      indexed={Number(source.indexed_count)}
                      total={Number(source.pages_count)}
                      compact
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-400">
                      {formatRelativeTime(source.last_crawl_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-slate-500">
                      {formatRelativeTime(source.next_crawl_at)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {readOnly ? (
                        <Button size="sm" variant="ghost" asChild className="text-slate-400 hover:text-white h-7 w-7 p-0">
                          <Link href={`/super-admin/web-sources/${source.id}`}>
                            <Icons.eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCrawl(source.id)}
                            disabled={loading === source.id || !source.is_active}
                            className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 h-7 w-7 p-0"
                            title="Lancer un crawl"
                          >
                            {loading === source.id ? (
                              <Icons.loader className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Icons.refresh className="h-3.5 w-3.5" />
                            )}
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white h-7 w-7 p-0" aria-label="Actions">
                                <Icons.moreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
                              <DropdownMenuItem asChild>
                                <Link href={`/super-admin/web-sources/${source.id}`} className="text-slate-200 hover:bg-slate-700 cursor-pointer">
                                  <Icons.eye className="h-4 w-4 mr-2" /> Voir detail
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/super-admin/web-sources/${source.id}/edit`} className="text-slate-200 hover:bg-slate-700 cursor-pointer">
                                  <Icons.edit className="h-4 w-4 mr-2" /> Modifier
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCrawl(source.id)} disabled={!source.is_active} className="text-blue-400 hover:bg-slate-700 cursor-pointer">
                                <Icons.refresh className="h-4 w-4 mr-2" /> Lancer crawl
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-slate-700" />
                              <DropdownMenuItem
                                onClick={() => handleToggleActive(source.id, source.is_active)}
                                className={`cursor-pointer ${source.is_active ? 'text-yellow-400 hover:bg-slate-700' : 'text-green-400 hover:bg-slate-700'}`}
                              >
                                {source.is_active ? (
                                  <><Icons.pause className="h-4 w-4 mr-2" /> Desactiver</>
                                ) : (
                                  <><Icons.play className="h-4 w-4 mr-2" /> Activer</>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeleteId(source.id)} className="text-red-400 hover:bg-red-500/10 cursor-pointer">
                                <Icons.trash className="h-4 w-4 mr-2" /> Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400">
            {startItem}-{endItem} sur {totalCount} resultats
          </span>
          <div className="flex items-center gap-1">
            {/* First */}
            <Link href={buildUrl({ page: 1 })}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1} className="border-slate-600 text-slate-300 h-8 w-8 p-0">
                <Icons.chevronLeft className="h-3 w-3" /><Icons.chevronLeft className="h-3 w-3 -ml-2" />
              </Button>
            </Link>
            {/* Prev */}
            <Link href={buildUrl({ page: Math.max(1, currentPage - 1) })}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1} className="border-slate-600 text-slate-300 h-8 w-8 p-0">
                <Icons.chevronLeft className="h-4 w-4" />
              </Button>
            </Link>

            {/* Page numbers */}
            {getPageNumbers(currentPage, totalPages).map((p, i) => (
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="text-slate-500 px-1">...</span>
              ) : (
                <Link key={p} href={buildUrl({ page: p as number })}>
                  <Button
                    variant={currentPage === p ? 'default' : 'outline'}
                    size="sm"
                    className={`h-8 w-8 p-0 ${currentPage === p ? 'bg-blue-600 text-white' : 'border-slate-600 text-slate-300'}`}
                  >
                    {p}
                  </Button>
                </Link>
              )
            ))}

            {/* Next */}
            <Link href={buildUrl({ page: Math.min(totalPages, currentPage + 1) })}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} className="border-slate-600 text-slate-300 h-8 w-8 p-0">
                <Icons.chevronRight className="h-4 w-4" />
              </Button>
            </Link>
            {/* Last */}
            <Link href={buildUrl({ page: totalPages })}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} className="border-slate-600 text-slate-300 h-8 w-8 p-0">
                <Icons.chevronRight className="h-3 w-3" /><Icons.chevronRight className="h-3 w-3 -ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irreversible. La source et toutes ses pages crawlees seront supprimees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Calcule les numéros de pages à afficher dans la pagination
 */
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '...')[] = [1]

  if (current > 3) pages.push('...')

  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)

  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('...')

  pages.push(total)

  return pages
}
