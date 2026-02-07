'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

interface WebSource {
  id: string
  name: string
  base_url: string
  description: string | null
  category: string
  language: string
  priority: number
  is_active: boolean
  health_status: string
  consecutive_failures: number
  last_crawl_at: string | null
  next_crawl_at: string | null
  pages_count: number
  indexed_count: number
  total_pages_discovered: number
  avg_pages_per_crawl: number
}

interface WebSourcesListProps {
  sources: WebSource[]
  currentPage: number
  totalPages: number
  category: string
  status: string
  search: string
}

const CATEGORY_LABELS: Record<string, string> = {
  legislation: 'Législation',
  jurisprudence: 'Jurisprudence',
  doctrine: 'Doctrine',
  jort: 'JORT',
  modeles: 'Modèles',
  procedures: 'Procédures',
  formulaires: 'Formulaires',
  autre: 'Autre',
}

const CATEGORY_COLORS: Record<string, string> = {
  legislation: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  jurisprudence: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  doctrine: 'bg-green-500/20 text-green-400 border-green-500/30',
  jort: 'bg-red-500/20 text-red-400 border-red-500/30',
  modeles: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  procedures: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  formulaires: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  autre: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}

export function WebSourcesList({
  sources,
  currentPage,
  totalPages,
  category,
  status,
  search,
}: WebSourcesListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

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
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur lors du crawl',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Crawl lancé',
          description: data.async ? 'Job ajouté à la queue' : `${data.crawl?.pagesProcessed} pages traitées`,
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors du crawl',
        variant: 'destructive',
      })
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
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur lors de la mise à jour',
          variant: 'destructive',
        })
      } else {
        toast({
          title: isActive ? 'Source désactivée' : 'Source activée',
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la mise à jour',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return

    setLoading(deleteId)
    try {
      const res = await fetch(`/api/admin/web-sources/${deleteId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur lors de la suppression',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Source supprimée',
          description: 'La source et ses pages ont été supprimées',
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
      setDeleteId(null)
    }
  }

  const buildUrl = (params: Record<string, string | number>) => {
    const searchParams = new URLSearchParams()
    if (category) searchParams.set('category', category)
    if (status) searchParams.set('status', status)
    if (search) searchParams.set('search', search)
    Object.entries(params).forEach(([key, val]) => {
      if (val) searchParams.set(key, String(val))
    })
    return `/super-admin/web-sources?${searchParams.toString()}`
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 bg-slate-800/50 rounded-lg">
        <Icons.globe className="h-12 w-12 mx-auto mb-4" />
        <p>Aucune source trouvée</p>
        <Link href="/super-admin/web-sources/new">
          <Button className="mt-4 bg-blue-600 hover:bg-blue-700">
            Ajouter une source
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {sources.map((source) => (
          <div
            key={source.id}
            className="flex items-start gap-4 p-4 rounded-lg bg-slate-800/50 hover:bg-slate-800/70 transition"
          >
            {/* Indicateur de santé */}
            <div className="shrink-0 pt-1">
              <HealthIndicator status={source.health_status} />
            </div>

            {/* Contenu principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/super-admin/web-sources/${source.id}`}
                  className="font-medium text-white hover:text-blue-400 transition"
                >
                  {source.name}
                </Link>
                <Badge className={CATEGORY_COLORS[source.category] || CATEGORY_COLORS.autre}>
                  {CATEGORY_LABELS[source.category] || source.category}
                </Badge>
                {!source.is_active && (
                  <Badge variant="outline" className="border-slate-600 text-slate-500">
                    Inactive
                  </Badge>
                )}
                {source.consecutive_failures > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    {source.consecutive_failures} échec(s)
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <Icons.link className="h-3 w-3 text-slate-500" />
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
                <p className="text-sm text-slate-400 mt-1 line-clamp-1">
                  {source.description}
                </p>
              )}

              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Icons.fileText className="h-3 w-3" />
                  {source.pages_count} pages ({source.indexed_count} indexées)
                </span>
                {source.last_crawl_at && (
                  <span>
                    Dernier crawl: {new Date(source.last_crawl_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
                {source.next_crawl_at && (
                  <span>
                    Prochain: {new Date(source.next_crawl_at).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
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
                      href={`/super-admin/web-sources/${source.id}`}
                      className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Icons.eye className="h-4 w-4 mr-2" />
                      Voir détail
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/super-admin/web-sources/${source.id}/edit`}
                      className="text-slate-200 hover:bg-slate-700 cursor-pointer"
                    >
                      <Icons.edit className="h-4 w-4 mr-2" />
                      Modifier
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleCrawl(source.id)}
                    disabled={!source.is_active}
                    className="text-blue-400 hover:bg-slate-700 cursor-pointer"
                  >
                    <Icons.refresh className="h-4 w-4 mr-2" />
                    Lancer crawl
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-slate-700" />
                  <DropdownMenuItem
                    onClick={() => handleToggleActive(source.id, source.is_active)}
                    className={source.is_active
                      ? "text-yellow-400 hover:bg-slate-700 cursor-pointer"
                      : "text-green-400 hover:bg-slate-700 cursor-pointer"
                    }
                  >
                    {source.is_active ? (
                      <>
                        <Icons.pause className="h-4 w-4 mr-2" />
                        Désactiver
                      </>
                    ) : (
                      <>
                        <Icons.play className="h-4 w-4 mr-2" />
                        Activer
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteId(source.id)}
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
              Cette action est irréversible. La source et toutes ses pages crawlées seront supprimées.
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

function HealthIndicator({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    failing: 'bg-red-500',
    unknown: 'bg-slate-500',
  }

  return (
    <div
      className={`w-3 h-3 rounded-full ${colors[status] || colors.unknown}`}
      title={`Statut: ${status}`}
    />
  )
}
