'use client'

/**
 * Section Statut Batches
 * 3 cards : KB Indexation, Web Crawls, Analyses Qualité
 * S1.2 : Actions Batches (Pause | Reprendre | Retry | Kill)
 */

import { useEffect, useState } from 'react'
import { getErrorMessage } from '@/lib/utils/error-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
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
import { Database, Globe, Target, RefreshCw, Pause, Play, RotateCcw, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface BatchStats {
  kbIndexation: {
    pending: number
    processing: number
    completedToday: number
    failedToday: number
    avgDurationSec: number
    successRate: number
  }
  webCrawls: {
    activeJobs: number
    pagesCrawledToday: number
    pagesFailedToday: number
    avgFetchMs: number
    successRate: number
  }
  qualityAnalysis: {
    pendingAnalysis: number
    analyzedToday: number
    highQualityToday: number
    lowQualityToday: number
    avgScoreToday: number
    successRate: number
  }
}

export function BatchesStatusSection() {
  const [stats, setStats] = useState<BatchStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{
    type: 'pause' | 'resume' | 'retry' | 'kill'
    batchType: string
    title: string
    description: string
  } | null>(null)


  const fetchBatchStats = async () => {
    try {
      const response = await fetch('/api/admin/cron-executions/batches')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.batches) {
        setStats(data.batches)
      }
    } catch (error) {
      console.error('[Batches Stats] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  // S1.2 : Exécuter une action sur un batch
  const executeBatchAction = async (
    action: 'pause' | 'resume' | 'retry' | 'kill',
    batchType: string
  ) => {
    try {
      setActionLoading(true)

      const response = await fetch(`/api/admin/batches/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchType }),
      })

      const data = await response.json()

      if (data.success) {
        toast.success(`${action === 'pause' ? 'Pause' : action === 'resume' ? 'Reprise' : action === 'retry' ? 'Retry' : 'Arr\u00eat'} du batch ${batchType} effectu\u00e9 avec succ\u00e8s.`)

        // Rafraîchir les stats
        await fetchBatchStats()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Impossible d\'ex\u00e9cuter l\'action')
    } finally {
      setActionLoading(false)
      setConfirmAction(null)
    }
  }

  useEffect(() => {
    fetchBatchStats()

    // Auto-refresh toutes les 30s
    const interval = setInterval(fetchBatchStats, 30000)

    return () => clearInterval(interval)
  }, [])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Statut Batches</h3>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Card 1: KB Indexation */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">KB Indexation</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Pending */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En attente</span>
                <Badge variant="outline">{stats.kbIndexation.pending}</Badge>
              </div>

              {/* Running */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En cours</span>
                <Badge className="bg-blue-500">
                  {stats.kbIndexation.processing} actif
                  {stats.kbIndexation.processing > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Completed Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Complétés aujourd'hui
                </span>
                <Badge className="bg-green-500">
                  {stats.kbIndexation.completedToday}
                </Badge>
              </div>

              {/* Failed Today */}
              {stats.kbIndexation.failedToday > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Échecs</span>
                  <Badge variant="destructive">{stats.kbIndexation.failedToday}</Badge>
                </div>
              )}

              {/* Success Rate */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Taux succès</span>
                  <span className="text-xs font-semibold">
                    {stats.kbIndexation.successRate}%
                  </span>
                </div>
                <Progress value={stats.kbIndexation.successRate} className="h-2" />
              </div>

              {/* S1.2 : Actions */}
              <div className="pt-3 border-t flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'pause',
                      batchType: 'kb-indexation',
                      title: 'Pause KB Indexation',
                      description: 'Mettre en pause les indexations en attente ?',
                    })
                  }
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'resume',
                      batchType: 'kb-indexation',
                      title: 'Reprendre KB Indexation',
                      description: 'Reprendre les indexations pausées ?',
                    })
                  }
                >
                  <Play className="h-3 w-3 mr-1" />
                  Reprendre
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading || stats.kbIndexation.failedToday === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'retry',
                      batchType: 'kb-indexation',
                      title: 'Retry Échecs KB',
                      description: `Relancer les ${stats.kbIndexation.failedToday} indexations échouées ?`,
                    })
                  }
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={actionLoading || stats.kbIndexation.processing === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'kill',
                      batchType: 'kb-indexation',
                      title: 'Arrêter KB Indexation',
                      description: 'Arrêter brutalement les indexations en cours ? (action irréversible)',
                    })
                  }
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Kill
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Web Crawls */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Web Crawls</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Active Jobs */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Jobs actifs</span>
                <Badge className="bg-blue-500">
                  {stats.webCrawls.activeJobs} job{stats.webCrawls.activeJobs > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Pages Crawled Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pages crawlées</span>
                <Badge className="bg-green-500">{stats.webCrawls.pagesCrawledToday}</Badge>
              </div>

              {/* Pages Failed Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Échecs</span>
                <Badge variant={stats.webCrawls.pagesFailedToday > 0 ? 'destructive' : 'outline'}>
                  {stats.webCrawls.pagesFailedToday}
                </Badge>
              </div>

              {/* Avg Fetch Time */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Temps moy.</span>
                <span className="text-sm font-mono">
                  {Math.round(stats.webCrawls.avgFetchMs)}ms
                </span>
              </div>

              {/* Success Rate */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Taux succès</span>
                  <span className="text-xs font-semibold">
                    {stats.webCrawls.successRate}%
                  </span>
                </div>
                <Progress value={stats.webCrawls.successRate} className="h-2" />
              </div>

              {/* S1.2 : Actions */}
              <div className="pt-3 border-t flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'pause',
                      batchType: 'web-crawls',
                      title: 'Pause Web Crawls',
                      description: 'Mettre en pause les crawls en cours ?',
                    })
                  }
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'resume',
                      batchType: 'web-crawls',
                      title: 'Reprendre Web Crawls',
                      description: 'Reprendre les crawls pausés ?',
                    })
                  }
                >
                  <Play className="h-3 w-3 mr-1" />
                  Reprendre
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading || stats.webCrawls.pagesFailedToday === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'retry',
                      batchType: 'web-crawls',
                      title: 'Retry Échecs Crawls',
                      description: `Relancer les ${stats.webCrawls.pagesFailedToday} pages échouées ?`,
                    })
                  }
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={actionLoading || stats.webCrawls.activeJobs === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'kill',
                      batchType: 'web-crawls',
                      title: 'Arrêter Web Crawls',
                      description: 'Arrêter brutalement les crawls en cours ? (action irréversible)',
                    })
                  }
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Kill
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Analyses Qualité */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Analyses Qualité</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Pending Analysis */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En attente</span>
                <Badge variant="outline">{stats.qualityAnalysis.pendingAnalysis}</Badge>
              </div>

              {/* Analyzed Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Analysés aujourd'hui</span>
                <Badge className="bg-blue-500">{stats.qualityAnalysis.analyzedToday}</Badge>
              </div>

              {/* High Quality Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Haute qualité</span>
                <Badge className="bg-green-500">
                  {stats.qualityAnalysis.highQualityToday}
                </Badge>
              </div>

              {/* Avg Score Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Score moyen</span>
                <span className="text-lg font-bold">
                  {stats.qualityAnalysis.avgScoreToday}
                </span>
              </div>

              {/* Success Rate */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Taux succès</span>
                  <span className="text-xs font-semibold">
                    {stats.qualityAnalysis.successRate}%
                  </span>
                </div>
                <Progress value={stats.qualityAnalysis.successRate} className="h-2" />
              </div>

              {/* S1.2 : Actions */}
              <div className="pt-3 border-t flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'pause',
                      batchType: 'quality-analysis',
                      title: 'Pause Analyses Qualité',
                      description: 'Mettre en pause les analyses en cours ?',
                    })
                  }
                >
                  <Pause className="h-3 w-3 mr-1" />
                  Pause
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'resume',
                      batchType: 'quality-analysis',
                      title: 'Reprendre Analyses',
                      description: 'Reprendre les analyses pausées ?',
                    })
                  }
                >
                  <Play className="h-3 w-3 mr-1" />
                  Reprendre
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={actionLoading || stats.qualityAnalysis.lowQualityToday === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'retry',
                      batchType: 'quality-analysis',
                      title: 'Retry Échecs Qualité',
                      description: 'Relancer les analyses échouées ?',
                    })
                  }
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() =>
                    setConfirmAction({
                      type: 'kill',
                      batchType: 'quality-analysis',
                      title: 'Arrêter Analyses',
                      description: 'Arrêter brutalement les analyses en cours ? (action irréversible)',
                    })
                  }
                >
                  <XCircle className="h-3 w-3 mr-1" />
                  Kill
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* S1.2 : AlertDialog de confirmation */}
      {confirmAction && (
        <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmAction.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmAction.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                disabled={actionLoading}
                onClick={() => executeBatchAction(confirmAction.type, confirmAction.batchType)}
                className={confirmAction.type === 'kill' ? 'bg-destructive' : ''}
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    En cours...
                  </>
                ) : (
                  'Confirmer'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}
