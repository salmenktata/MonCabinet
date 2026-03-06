'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
  rag_enabled: boolean
}

interface WebSourceActionsProps {
  source: WebSource
  readOnly?: boolean
}

export function WebSourceActions({ source, readOnly = false }: WebSourceActionsProps) {
  const router = useRouter()

  const [loading, setLoading] = useState<string | null>(null)

  // Delete flow
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePreview, setDeletePreview] = useState<{
    webPages: number
    knowledgeBaseDocs: number
  } | null>(null)

  // Organize flow
  const [showOrganize, setShowOrganize] = useState(false)
  const [organizeStats, setOrganizeStats] = useState<{
    totalPages: number
    pagesWithMetadata: number
    pagesWithoutMetadata: number
    estimatedTime: string
    estimatedCost: string
  } | null>(null)

  // Deactivate confirmation
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)

  // ─── Crawler ─────────────────────────────────────────────────────────────────

  const handleCrawl = async (jobType: 'incremental' | 'full_crawl') => {
    setLoading('crawl')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, async: true }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors du lancement du crawl')
      } else {
        const label = jobType === 'full_crawl' ? 'Crawl complet' : 'Crawl incrémental'
        toast.success(`${label} démarré en arrière-plan — consultez les logs pour le suivi`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors du lancement du crawl')
    } finally {
      setLoading(null)
    }
  }

  // ─── Indexer ──────────────────────────────────────────────────────────────────

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
        toast.error(data.error || "Erreur lors de l'indexation")
      } else {
        toast.success(
          `Indexation terminée — ${data.succeeded}/${data.processed} pages indexées${data.remaining > 0 ? ` (${data.remaining} restantes)` : ''}`
        )
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'indexation")
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
        toast.error(data.error || "Erreur lors de l'indexation des fichiers")
      } else {
        toast.success(
          `Fichiers traités — ${data.indexed} indexés, ${data.downloaded} téléchargés${data.failed > 0 ? `, ${data.failed} échoués` : ''}`
        )
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'indexation des fichiers")
    } finally {
      setLoading(null)
    }
  }

  // ─── Désactiver / Activer ─────────────────────────────────────────────────────

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
        toast.error(data.error || 'Erreur lors de la mise à jour')
      } else {
        toast.success(source.is_active ? `"${source.name}" désactivée` : `"${source.name}" activée`)
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de la mise à jour')
    } finally {
      setLoading(null)
      setShowDeactivateConfirm(false)
    }
  }

  const handleClickToggleActive = () => {
    if (source.is_active) {
      // Désactivation → confirmation obligatoire
      setShowDeactivateConfirm(true)
    } else {
      // Activation → direct
      handleToggleActive()
    }
  }

  // ─── Toggle RAG enabled ───────────────────────────────────────────────────────

  const handleToggleRag = async () => {
    setLoading('rag')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ragEnabled: !source.rag_enabled }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Erreur lors de la mise à jour RAG')
      } else {
        toast.success(
          source.rag_enabled
            ? `RAG désactivé pour "${source.name}" — les pages ne seront plus retournées dans les recherches`
            : `RAG activé pour "${source.name}"`
        )
        router.refresh()
      }
    } catch {
      toast.error('Erreur lors de la mise à jour RAG')
    } finally {
      setLoading(null)
    }
  }

  // ─── Supprimer (flow 2 étapes) ────────────────────────────────────────────────

  const handleOpenDelete = async () => {
    setLoading('delete-preview')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}?preview=true`, {
        method: 'DELETE',
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.message || data.error || 'Erreur lors de la récupération des stats')
        return
      }

      setDeletePreview({
        webPages: data.stats?.webPages ?? 0,
        knowledgeBaseDocs: data.stats?.knowledgeBaseDocs ?? 0,
      })
      setShowDeleteConfirm(true)
    } catch {
      toast.error('Erreur lors de la récupération des stats')
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
        const errorMessage = data.message || data.error || 'Erreur lors de la suppression'
        const details = data.details?.length > 0 ? data.details.join(' | ') : undefined
        toast.error(details ? `${errorMessage} — ${details}` : errorMessage, { duration: 10000 })
      } else {
        const stats = data.stats
        const statsMessage = stats
          ? `${stats.webPages} pages, ${stats.knowledgeBaseDocs} docs KB supprimés`
          : undefined
        toast.success(statsMessage ? `Source supprimée — ${statsMessage}` : 'Source supprimée')
        router.push('/super-admin/web-sources')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setLoading(null)
      setShowDeleteConfirm(false)
    }
  }

  // ─── Organiser ────────────────────────────────────────────────────────────────

  const handleOpenOrganize = async () => {
    setLoading('organize-stats')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/metadata/bulk`)
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de la récupération des stats')
        return
      }

      const estimatedMinutes = data.estimatedTimeMinutes || 0
      const estimatedTime =
        estimatedMinutes < 60
          ? `${estimatedMinutes} min`
          : `${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`

      const estimatedCostUsd =
        data.estimatedCost != null
          ? `~$${Number(data.estimatedCost).toFixed(2)} USD`
          : '~$0.40 USD'

      setOrganizeStats({
        totalPages: data.totalPages,
        pagesWithMetadata: data.pagesWithMetadata,
        pagesWithoutMetadata: data.pagesWithoutMetadata,
        estimatedTime,
        estimatedCost: estimatedCostUsd,
      })
      setShowOrganize(true)
    } catch {
      toast.error('Erreur lors de la récupération des stats')
    } finally {
      setLoading(null)
    }
  }

  const handleOrganize = async () => {
    setLoading('organize')
    try {
      const res = await fetch(`/api/admin/web-sources/${source.id}/organize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10, concurrency: 5 }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || "Erreur lors de l'organisation")
      } else {
        toast.success(`Organisation lancée — Extraction et classification en cours... ${data.message || ''}`)
        setShowOrganize(false)
        router.refresh()
      }
    } catch {
      toast.error("Erreur lors de l'organisation")
    } finally {
      setLoading(null)
    }
  }

  // ─── Read-only ────────────────────────────────────────────────────────────────

  if (readOnly) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icons.eye className="h-4 w-4" />
        <span>Lecture seule</span>
      </div>
    )
  }

  const isRAGDisabled = !source.rag_enabled

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Badge RAG désactivé */}
        {isRAGDisabled && (
          <Badge
            variant="outline"
            className="border-red-500/50 text-red-400 text-xs px-2 py-0.5"
            title="Cette source est exclue des recherches RAG"
          >
            RAG off
          </Badge>
        )}

        {/* Split Button Crawler */}
        <SplitButton
          label="Crawler"
          icon={<Icons.refresh className="h-4 w-4" />}
          onClick={() => handleCrawl('incremental')}
          disabled={loading !== null || !source.is_active || isRAGDisabled}
          loading={loading === 'crawl'}
          className="bg-blue-600 hover:bg-blue-700"
          options={[
            {
              label: 'Crawl incrémental',
              icon: <Icons.refresh className="h-4 w-4" />,
              onClick: () => handleCrawl('incremental'),
              disabled: !source.is_active || isRAGDisabled,
              badge: 'Par défaut',
            },
            {
              label: 'Crawl complet',
              icon: <Icons.refresh className="h-4 w-4" />,
              onClick: () => handleCrawl('full_crawl'),
              disabled: !source.is_active || isRAGDisabled,
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
          loading={loading === 'index' || loading === 'files'}
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
            <Button
              variant="outline"
              className="border-border text-foreground"
              disabled={loading === 'delete-preview'}
            >
              {loading === 'delete-preview' ? (
                <Icons.loader className="h-4 w-4 animate-spin" />
              ) : (
                <Icons.moreVertical className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border">
            <DropdownMenuItem asChild>
              <Link
                href={`/super-admin/web-sources/${source.id}/edit`}
                className="text-foreground hover:bg-muted cursor-pointer"
              >
                <Icons.edit className="h-4 w-4 mr-2" />
                Modifier
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={`/super-admin/web-sources/${source.id}/files`}
                className="text-foreground hover:bg-muted cursor-pointer"
              >
                <Icons.file className="h-4 w-4 mr-2" />
                Voir les fichiers
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleToggleRag}
              disabled={loading !== null}
              className={
                source.rag_enabled
                  ? 'text-red-400 hover:bg-muted cursor-pointer'
                  : 'text-green-400 hover:bg-muted cursor-pointer'
              }
            >
              {source.rag_enabled ? (
                <>
                  <Icons.eyeOff className="h-4 w-4 mr-2" />
                  Désactiver RAG
                </>
              ) : (
                <>
                  <Icons.eye className="h-4 w-4 mr-2" />
                  Activer RAG
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem
              onClick={handleClickToggleActive}
              disabled={loading !== null}
              className={
                source.is_active
                  ? 'text-yellow-400 hover:bg-muted cursor-pointer'
                  : 'text-green-400 hover:bg-muted cursor-pointer'
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
              onClick={handleOpenDelete}
              disabled={loading !== null}
              className="text-red-400 hover:bg-red-500/10 cursor-pointer"
            >
              <Icons.trash className="h-4 w-4 mr-2" />
              Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Dialog confirmation désactivation */}
      <AlertDialog open={showDeactivateConfirm} onOpenChange={setShowDeactivateConfirm}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.pause className="h-5 w-5 text-yellow-400" />
              Désactiver la source ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              La source &quot;{source.name}&quot; ne sera plus crawlée automatiquement. Les pages déjà
              indexées restent accessibles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-muted text-foreground border-border hover:bg-muted"
              disabled={loading === 'toggle'}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              className="bg-yellow-600 hover:bg-yellow-700"
              disabled={loading === 'toggle'}
            >
              {loading === 'toggle' && <Icons.loader className="h-4 w-4 animate-spin mr-2" />}
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog suppression (2 étapes) */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card border-border text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.trash className="h-5 w-5 text-red-400" />
              Supprimer la source ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Cette action est irréversible. La source &quot;{source.name}&quot; et toutes ses données
              associées seront supprimées définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deletePreview && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="bg-card/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">
                  {deletePreview.webPages.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">pages web</p>
              </div>
              <div className="bg-card/50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-400">
                  {deletePreview.knowledgeBaseDocs.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">docs KB + chunks</p>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-muted text-foreground border-border hover:bg-muted"
              disabled={loading === 'delete'}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              disabled={loading === 'delete'}
            >
              {loading === 'delete' && <Icons.loader className="h-4 w-4 animate-spin mr-2" />}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog organisation */}
      <AlertDialog open={showOrganize} onOpenChange={setShowOrganize}>
        <AlertDialogContent className="bg-card border-border text-foreground max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icons.sparkles className="h-5 w-5 text-orange-400" />
              Organiser et classifier les pages
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Extraction automatique des métadonnées structurées et classification juridique intelligente.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {organizeStats && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-card/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Pages totales</p>
                  <p className="text-2xl font-bold text-foreground">
                    {organizeStats.totalPages.toLocaleString()}
                  </p>
                </div>
                <div className="bg-card/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">À organiser</p>
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
                    <ul className="text-foreground space-y-1 ml-4 list-disc">
                      <li>19 champs de métadonnées juridiques (dates, numéros, références)</li>
                      <li>Classification par domaine (civil, pénal, commercial, etc.)</li>
                      <li>Classification par type (législation, jurisprudence, doctrine)</li>
                      <li>Validation stricte contre listes de référence</li>
                    </ul>
                    <p className="text-muted-foreground text-xs mt-2">
                      ⏱️ Temps estimé :{' '}
                      <span className="text-foreground font-medium">{organizeStats.estimatedTime}</span>
                      <br />
                      💰 Coût estimé :{' '}
                      <span className="text-foreground font-medium">{organizeStats.estimatedCost}</span>{' '}
                      (Ollama gratuit prioritaire)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Icons.alertTriangle className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300">
                    L&apos;opération s&apos;exécute en arrière-plan. Vous pouvez fermer cette fenêtre et
                    revenir plus tard.
                  </p>
                </div>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              className="bg-muted text-foreground border-border hover:bg-muted"
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
              Lancer l&apos;organisation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
