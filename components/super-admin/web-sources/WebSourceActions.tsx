'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { SplitButton } from '@/components/ui/split-button'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'
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
  readOnly?: boolean
}

export function WebSourceActions({ source, readOnly = false }: WebSourceActionsProps) {
  const router = useRouter()

  const [loading, setLoading] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showOrganize, setShowOrganize] = useState(false)
  const [organizeStats, setOrganizeStats] = useState<{
    totalPages: number
    pagesWithMetadata: number
    pagesWithoutMetadata: number
    estimatedTime: string
  } | null>(null)

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
        toast.error(data.error || 'Erreur lors du crawl')
      } else {
        toast.success(`Crawl termin\u00e9 \u2014 ${data.crawl?.pagesProcessed || 0} pages trait\u00e9es, ${data.crawl?.pagesNew || 0} nouvelles`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors du crawl')
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
        toast.error(data.error || 'Erreur lors de l\'indexation')
      } else {
        toast.success(`Indexation termin\u00e9e \u2014 ${data.succeeded}/${data.processed} pages index\u00e9es${data.remaining > 0 ? ` (${data.remaining} restantes)` : ''}`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de l\'indexation')
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
        toast.error(data.error || 'Erreur lors de l\'indexation des fichiers')
      } else {
        toast.success(`Fichiers trait\u00e9s \u2014 ${data.indexed} index\u00e9s, ${data.downloaded} t\u00e9l\u00e9charg\u00e9s${data.failed > 0 ? `, ${data.failed} \u00e9chou\u00e9s` : ''}`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de l\'indexation des fichiers')
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
        toast.error(data.error || 'Erreur lors de la mise \u00e0 jour')
      } else {
        toast.success(source.is_active ? 'Source d\u00e9sactiv\u00e9e' : 'Source activ\u00e9e')
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de la mise \u00e0 jour')
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

      const data = await res.json()

      if (!res.ok) {
        // Afficher le message d'erreur détaillé
        const errorMessage = data.message || data.error || 'Erreur lors de la suppression'
        const details = data.details?.length > 0 ? data.details.join(' | ') : undefined

        toast.error(details ? `${errorMessage} \u2014 ${details}` : errorMessage, { duration: 10000 })
      } else {
        // Succès
        const stats = data.stats
        const statsMessage = stats
          ? `${stats.webPages} pages, ${stats.knowledgeBaseDocs} docs KB supprimés`
          : undefined

        toast.success(statsMessage ? `Source supprim\u00e9e \u2014 ${statsMessage}` : 'Source supprim\u00e9e')

        router.push('/super-admin/web-sources')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setLoading(null)
      setShowDelete(false)
    }
  }

  const handleOpenOrganize = async () => {
    setLoading('organize-stats')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/metadata/bulk`)
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de la r\u00e9cup\u00e9ration des stats')
        return
      }

      const estimatedMinutes = data.estimatedTimeMinutes || 0
      const estimatedTime =
        estimatedMinutes < 60
          ? `${estimatedMinutes} min`
          : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`

      setOrganizeStats({
        totalPages: data.totalPages,
        pagesWithMetadata: data.pagesWithMetadata,
        pagesWithoutMetadata: data.pagesWithoutMetadata,
        estimatedTime,
      })
      setShowOrganize(true)
    } catch {
      toast.error('Erreur lors de la r\u00e9cup\u00e9ration des stats')
    } finally {
      setLoading(null)
    }
  }

  const handleOrganize = async () => {
    setLoading('organize')
    try {
      // Lancer l'extraction bulk en arrière-plan
      const res = await fetch(`/api/admin/web-sources/${source.id}/organize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10, concurrency: 5 }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de l\'organisation')
      } else {
        toast.success(`Organisation lanc\u00e9e \u2014 Extraction et classification en cours... ${data.message || ''}`)
        setShowOrganize(false)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de l\'organisation')
    } finally {
      setLoading(null)
    }
  }

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Icons.eye className="h-4 w-4" />
        <span>Lecture seule</span>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Split Button Crawler */}
        <SplitButton
          label="Crawler"
          icon={<Icons.refresh className="h-4 w-4" />}
          onClick={() => handleCrawl('incremental')}
          disabled={loading !== null || !source.is_active}
          loading={loading === 'crawl'}
          className="bg-blue-600 hover:bg-blue-700"
          options={[
            {
              label: 'Crawl incrémental',
              icon: <Icons.refresh className="h-4 w-4" />,
              onClick: () => handleCrawl('incremental'),
              disabled: !source.is_active,
              badge: 'Par défaut',
            },
            {
              label: 'Crawl complet',
              icon: <Icons.refresh className="h-4 w-4" />,
              onClick: () => handleCrawl('full_crawl'),
              disabled: !source.is_active,
              className: 'text-blue-400',
            },
          ]}
        />

        {/* Split Button Indexer */}
        <SplitButton
          label="Indexer"
          icon={<Icons.box className="h-4 w-4" />}
          onClick={() => handleIndex(false)}
          disabled={loading !== null}
          loading={loading === 'index'}
          variant="outline"
          className="border-purple-500 text-purple-400 hover:bg-purple-500/20"
          options={[
            {
              label: 'Indexer nouveau',
              icon: <Icons.box className="h-4 w-4" />,
              onClick: () => handleIndex(false),
              badge: 'Par défaut',
            },
            {
              label: 'Réindexer tout',
              icon: <Icons.refresh className="h-4 w-4" />,
              onClick: () => handleIndex(true),
              className: 'text-purple-400',
            },
            {
              label: 'Indexer les PDF',
              icon: <Icons.fileText className="h-4 w-4" />,
              onClick: handleIndexFiles,
              disabled: loading === 'files',
              className: 'text-orange-400',
            },
          ]}
        />

        {/* Bouton Organiser */}
        <Button
          onClick={handleOpenOrganize}
          disabled={loading !== null}
          variant="outline"
          className="border-orange-500 text-orange-400 hover:bg-orange-500/20"
        >
          {loading === 'organize-stats' ? (
            <Icons.loader className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Icons.sparkles className="h-4 w-4 mr-2" />
          )}
          Organiser
        </Button>

        {/* Menu Actions Secondaires */}
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

      <AlertDialog open={showOrganize} onOpenChange={setShowOrganize}>
        <AlertDialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.sparkles className="h-5 w-5 text-orange-400" />
              Organiser et classifier les pages
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Extraction automatique des métadonnées structurées et classification juridique intelligente.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {organizeStats && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400">Pages totales</p>
                  <p className="text-2xl font-bold text-white">
                    {organizeStats.totalPages.toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-400">À organiser</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {organizeStats.pagesWithoutMetadata.toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Icons.info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="text-blue-300 font-medium">
                      Cette opération va extraire et classifier :
                    </p>
                    <ul className="text-slate-300 space-y-1 ml-4 list-disc">
                      <li>19 champs de métadonnées juridiques (dates, numéros, références)</li>
                      <li>Classification par domaine (civil, pénal, commercial, etc.)</li>
                      <li>Classification par type (législation, jurisprudence, doctrine)</li>
                      <li>Validation stricte contre listes de référence</li>
                    </ul>
                    <p className="text-slate-400 text-xs mt-2">
                      ⏱️ Temps estimé : <span className="text-white font-medium">{organizeStats.estimatedTime}</span>
                      <br />
                      💰 Coût estimé : <span className="text-white font-medium">~0.40 USD</span> (Ollama gratuit prioritaire)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Icons.alertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300">
                    L'opération s'exécute en arrière-plan. Vous pouvez fermer cette fenêtre et revenir plus tard.
                  </p>
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-slate-700 text-white border-slate-600 hover:bg-slate-600"
              disabled={loading === 'organize'}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOrganize}
              className="bg-orange-600 hover:bg-orange-700"
              disabled={loading === 'organize'}
            >
              {loading === 'organize' && <Icons.loader className="h-4 w-4 animate-spin mr-2" />}
              Lancer l'organisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
