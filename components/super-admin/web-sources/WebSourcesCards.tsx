'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
import { getCategoryLabel, CATEGORY_COLORS } from '@/lib/web-scraper/category-labels'
import type { WebSourceCategory } from '@/lib/web-scraper/types'
import { HealthBadge } from './HealthBadge'
import { IndexationProgress } from './IndexationProgress'
import { formatRelativeTime, getSourceType } from './utils'
import type { WebSourceListItem } from './types'
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

interface WebSourcesCardsProps {
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

export function WebSourcesCards({
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
}: WebSourcesCardsProps) {
  const router = useRouter()
  const locale = useLocale() as 'fr' | 'ar'
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const limit = 20
  const startItem = (currentPage - 1) * limit + 1
  const endItem = Math.min(currentPage * limit, totalCount)

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
        toast.error(data.error || 'Erreur lors du crawl')
      } else {
        toast.success(data.async ? 'Crawl lance — Job ajoute a la queue' : `Crawl lance — ${data.crawl?.pagesProcessed} pages traitees`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors du crawl')
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
        toast.error(data.error || 'Erreur')
      } else {
        toast.success(isActive ? 'Source desactivee' : 'Source activee')
        router.refresh()
      }
    } catch {
      toast.error('Erreur')
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
        toast.error(data.message || data.error || 'Erreur', { duration: 10000 })
      } else {
        toast.success(data.stats ? `Source supprimee — ${data.stats.webPages} pages supprimees` : 'Source supprimee — Donnees supprimees')
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(null)
      setDeleteId(null)
    }
  }

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
      <div className="space-y-3">
        {sources.map((source) => {
          const sourceType = getSourceType(source.drive_config)
          return (
            <div
              key={source.id}
              className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition"
            >
              {/* Health + type icon */}
              <div className="shrink-0 pt-0.5">
                <HealthBadge status={source.health_status} consecutiveFailures={source.consecutive_failures} size="sm" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {sourceType === 'gdrive' ? (
                    <Icons.cloud className="h-4 w-4 text-blue-400 shrink-0" />
                  ) : (
                    <Icons.globe className="h-4 w-4 text-slate-500 shrink-0" />
                  )}
                  <Link
                    href={`/super-admin/web-sources/${source.id}`}
                    className="font-medium text-white hover:text-blue-400 transition"
                  >
                    {source.name}
                  </Link>
                  <Badge className={CATEGORY_COLORS[source.category] || CATEGORY_COLORS.autre}>
                    {getCategoryLabel(source.category as WebSourceCategory, locale)}
                  </Badge>
                  {!source.is_active && (
                    <Badge variant="outline" className="border-slate-600 text-slate-400">Inactive</Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <Icons.link className="h-3 w-3 text-slate-400" />
                  <a
                    href={source.base_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-400 hover:text-blue-400 truncate max-w-md"
                  >
                    {source.base_url}
                  </a>
                </div>

                {source.description && (
                  <p className="text-sm text-slate-400 mt-1 line-clamp-1">{source.description}</p>
                )}

                <div className="flex items-center gap-6 mt-2">
                  <div className="w-48">
                    <IndexationProgress
                      indexed={Number(source.indexed_count)}
                      total={Number(source.pages_count)}
                      compact
                    />
                  </div>
                  <span className="text-xs text-slate-400">
                    Crawl: {formatRelativeTime(source.last_crawl_at)}
                  </span>
                  {source.next_crawl_at && (
                    <span className="text-xs text-slate-500">
                      Prochain: {formatRelativeTime(source.next_crawl_at)}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {readOnly ? (
                  <Button size="sm" variant="ghost" asChild className="text-slate-400 hover:text-white">
                    <Link href={`/super-admin/web-sources/${source.id}`}>
                      <Icons.eye className="h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCrawl(source.id)}
                      disabled={loading === source.id || !source.is_active}
                      className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                      title="Lancer un crawl"
                    >
                      {loading === source.id ? (
                        <Icons.loader className="h-4 w-4 animate-spin" />
                      ) : (
                        <Icons.refresh className="h-4 w-4" />
                      )}
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-slate-400 hover:text-white" aria-label="Actions">
                          <Icons.moreVertical className="h-4 w-4" />
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
            </div>
          )
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-400">
            {startItem}-{endItem} sur {totalCount} resultats
          </span>
          <div className="flex items-center gap-2">
            <Link href={buildUrl({ page: 1 })}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1} className="border-slate-600 text-slate-300">
                <Icons.chevronLeft className="h-3 w-3" /><Icons.chevronLeft className="h-3 w-3 -ml-2" />
              </Button>
            </Link>
            <Link href={buildUrl({ page: Math.max(1, currentPage - 1) })}>
              <Button variant="outline" size="sm" disabled={currentPage <= 1} className="border-slate-600 text-slate-300">
                <Icons.chevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <span className="text-sm text-slate-400 px-2">
              {currentPage} / {totalPages}
            </span>
            <Link href={buildUrl({ page: Math.min(totalPages, currentPage + 1) })}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} className="border-slate-600 text-slate-300">
                <Icons.chevronRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={buildUrl({ page: totalPages })}>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} className="border-slate-600 text-slate-300">
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
