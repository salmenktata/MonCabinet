'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { toast } from 'sonner'

interface PageVersion {
  id: string
  versionNumber: number
  changeType: 'initial' | 'content_changed' | 'metadata_changed' | 'structure_changed' | 'minor_update'
  contentHash: string
  wordCount: number
  createdAt: string
}

interface WebPageVersionHistoryProps {
  sourceId: string
  pageId: string
}

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  initial: {
    label: 'Initiale',
    color: 'bg-green-500/20 text-green-300 border-green-500/30',
  },
  content_changed: {
    label: 'Contenu modifié',
    color: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  metadata_changed: {
    label: 'Métadonnées',
    color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
  structure_changed: {
    label: 'Structure',
    color: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  minor_update: {
    label: 'Mise à jour mineure',
    color: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
}

export function WebPageVersionHistory({ sourceId, pageId }: WebPageVersionHistoryProps) {
  const [versions, setVersions] = useState<PageVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const fetchVersions = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/admin/web-sources/${sourceId}/pages/${pageId}/versions`
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errData.error || `Erreur ${response.status}`)
      }

      const data = await response.json()
      setVersions(data.versions || data || [])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de charger les versions.')
    } finally {
      setLoading(false)
    }
  }, [sourceId, pageId])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  const handleRestore = async (versionId: string, versionNumber: number) => {
    setRestoringId(versionId)

    try {
      const response = await fetch(
        `/api/admin/web-sources/${sourceId}/pages/${pageId}/versions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ versionId }),
        }
      )

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Erreur serveur' }))
        throw new Error(errData.error || `Erreur ${response.status}`)
      }

      toast.success(`Version restaurée — La page a été restaurée à la version ${versionNumber}.`)

      // Refresh version list
      await fetchVersions()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible de restaurer la version.')
    } finally {
      setRestoringId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const truncateHash = (hash: string) => {
    if (hash.length <= 12) return hash
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 6)}`
  }

  if (loading) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="py-8">
          <div className="flex flex-col items-center gap-3">
            <Icons.loader className="h-8 w-8 text-slate-400 animate-spin" />
            <p className="text-sm text-slate-400">Chargement des versions...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (versions.length === 0) {
    return (
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Icons.history className="h-4 w-4" />
            Historique des versions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-slate-400">
            <Icons.history className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">Aucune version enregistrée pour cette page.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Icons.history className="h-4 w-4" />
          Historique des versions
          <span className="text-xs text-slate-400 font-normal ml-1">
            ({versions.length})
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Timeline */}
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[11px] top-3 bottom-3 w-px bg-slate-700" />

          <div className="space-y-4">
            {versions.map((version, index) => {
              const isLatest = index === 0
              const changeInfo = CHANGE_TYPE_LABELS[version.changeType] || CHANGE_TYPE_LABELS.minor_update
              const isRestoring = restoringId === version.id

              return (
                <div
                  key={version.id}
                  className="relative flex items-start gap-3 pl-0"
                >
                  {/* Timeline dot */}
                  <div
                    className={`
                      relative z-10 shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                      ${isLatest
                        ? 'bg-blue-500/30 border-2 border-blue-500'
                        : 'bg-slate-700 border-2 border-slate-600'
                      }
                    `}
                  >
                    <span className="text-[9px] font-bold text-white">
                      {version.versionNumber}
                    </span>
                  </div>

                  {/* Version content */}
                  <div
                    className={`
                      flex-1 p-3 rounded-lg transition
                      ${isLatest
                        ? 'bg-blue-500/10 border border-blue-500/30'
                        : 'bg-slate-900/50 hover:bg-slate-900/70'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium text-sm">
                          Version {version.versionNumber}
                        </span>
                        <Badge className={changeInfo.color + ' text-xs'}>
                          {changeInfo.label}
                        </Badge>
                        {isLatest && (
                          <Badge className="bg-blue-500/30 text-blue-300 text-xs">
                            Actuelle
                          </Badge>
                        )}
                      </div>

                      {!isLatest && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRestore(version.id, version.versionNumber)}
                          disabled={isRestoring}
                          className="text-slate-400 hover:text-white hover:bg-slate-600 h-7 text-xs"
                        >
                          {isRestoring ? (
                            <Icons.loader className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Icons.undo className="h-3 w-3 mr-1" />
                          )}
                          Restaurer
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1" title={version.contentHash}>
                        <Icons.hash className="h-3 w-3" />
                        {truncateHash(version.contentHash)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Icons.fileText className="h-3 w-3" />
                        {version.wordCount.toLocaleString('fr-FR')} mots
                      </span>
                      <span className="flex items-center gap-1">
                        <Icons.clock className="h-3 w-3" />
                        {formatDate(version.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
