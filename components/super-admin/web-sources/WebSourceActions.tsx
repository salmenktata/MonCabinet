'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { useToast } from '@/lib/hooks/use-toast'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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

interface WebSource {
  id: string
  name: string
  is_active: boolean
}

interface WebSourceActionsProps {
  source: WebSource
}

export function WebSourceActions({ source }: WebSourceActionsProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  const handleCrawl = async (jobType: 'incremental' | 'full_crawl') => {
    setLoading('crawl')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, async: false, indexAfterCrawl: true }),
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
          title: 'Crawl terminé',
          description: `${data.crawl?.pagesProcessed || 0} pages traitées, ${data.crawl?.pagesNew || 0} nouvelles`,
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

  const handleIndex = async (reindex: boolean = false) => {
    setLoading('index')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100, reindex }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur lors de l\'indexation',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Indexation terminée',
          description: `${data.succeeded}/${data.processed} pages indexées${data.remaining > 0 ? ` (${data.remaining} restantes)` : ''}`,
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'indexation',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleIndexFiles = async () => {
    setLoading('files')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Erreur',
          description: data.error || 'Erreur lors de l\'indexation des fichiers',
          variant: 'destructive',
        })
      } else {
        toast({
          title: 'Fichiers traités',
          description: `${data.indexed} indexés, ${data.downloaded} téléchargés${data.failed > 0 ? `, ${data.failed} échoués` : ''}`,
        })
        router.refresh()
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de l\'indexation des fichiers',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleToggleActive = async () => {
    setLoading('toggle')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !source.is_active }),
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
          title: source.is_active ? 'Source désactivée' : 'Source activée',
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
    setLoading('delete')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}`, {
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
        })
        router.push('/super-admin/web-sources')
      }
    } catch {
      toast({
        title: 'Erreur',
        description: 'Erreur lors de la suppression',
        variant: 'destructive',
      })
    } finally {
      setLoading(null)
      setShowDelete(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          onClick={() => handleCrawl('incremental')}
          disabled={loading !== null || !source.is_active}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {loading === 'crawl' ? (
            <Icons.loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icons.refresh className="h-4 w-4 mr-2" />
          )}
          Crawler
        </Button>

        <Button
          onClick={() => handleIndex(false)}
          disabled={loading !== null}
          variant="outline"
          className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
        >
          {loading === 'index' ? (
            <Icons.loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icons.box className="h-4 w-4 mr-2" />
          )}
          Indexer
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="border-slate-600 text-slate-300">
              <Icons.moreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-slate-800 border-slate-700">
            <DropdownMenuItem asChild>
              <Link
                href={`/super-admin/web-sources/${source.id}/edit`}
                className="text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <Icons.edit className="h-4 w-4 mr-2" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/super-admin/web-sources/${source.id}/files`}
                className="text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <Icons.file className="h-4 w-4 mr-2" />
                Voir les fichiers
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleCrawl('full_crawl')}
              disabled={!source.is_active}
              className="text-slate-200 hover:bg-slate-700 cursor-pointer"
            >
              <Icons.refresh className="h-4 w-4 mr-2" />
              Crawl complet
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleIndex(true)}
              className="text-purple-400 hover:bg-slate-700 cursor-pointer"
            >
              <Icons.box className="h-4 w-4 mr-2" />
              Réindexer tout
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleIndexFiles}
              disabled={loading === 'files'}
              className="text-orange-400 hover:bg-slate-700 cursor-pointer"
            >
              <Icons.fileText className="h-4 w-4 mr-2" />
              {loading === 'files' ? 'Indexation PDF...' : 'Indexer les PDF'}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-slate-700" />
            <DropdownMenuItem
              onClick={handleToggleActive}
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
              onClick={() => setShowDelete(true)}
              className="text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <Icons.trash className="h-4 w-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la source ?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Cette action est irréversible. La source "{source.name}" et toutes ses pages crawlées seront supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600">
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={loading === 'delete'}
            >
              {loading === 'delete' && <Icons.loader className="h-4 w-4 animate-spin mr-2" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
