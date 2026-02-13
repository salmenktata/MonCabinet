'use client'

/**
 * Section Statut Batches
 * 3 cards : KB Indexation, Web Crawls, Analyses Qualité
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Database, Globe, Target, RefreshCw } from 'lucide-react'

interface BatchStats {
  indexing: {
    pending: number
    running: number
    completed_today: number
    failed_today: number
    success_rate: number
  }
  crawls: {
    active_jobs: number
    pages_crawled_today: number
    total_pages_today: number
    avg_duration_s: number
  }
  quality: {
    queue: number
    processing: number
    success_rate: number
    avg_score: number
  }
}

export function BatchesStatusSection() {
  const [stats, setStats] = useState<BatchStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchBatchStats = async () => {
    try {
      // TODO: Créer API endpoint dédié pour stats batches
      // Pour l'instant, simulation avec données mockées
      const mockStats: BatchStats = {
        indexing: {
          pending: 245,
          running: 2,
          completed_today: 128,
          failed_today: 3,
          success_rate: 97.7,
        },
        crawls: {
          active_jobs: 1,
          pages_crawled_today: 42,
          total_pages_today: 150,
          avg_duration_s: 45,
        },
        quality: {
          queue: 186,
          processing: 4,
          success_rate: 94.2,
          avg_score: 82,
        },
      }

      // Simuler délai réseau
      await new Promise((resolve) => setTimeout(resolve, 500))

      setStats(mockStats)
    } catch (error) {
      console.error('[Batches Stats] Error:', error)
    } finally {
      setLoading(false)
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
                <Badge variant="outline">{stats.indexing.pending}</Badge>
              </div>

              {/* Running */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En cours</span>
                <Badge className="bg-blue-500">
                  {stats.indexing.running} actif{stats.indexing.running > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Completed Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Complétés aujourd'hui
                </span>
                <Badge className="bg-green-500">{stats.indexing.completed_today}</Badge>
              </div>

              {/* Failed Today */}
              {stats.indexing.failed_today > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Échecs</span>
                  <Badge variant="destructive">{stats.indexing.failed_today}</Badge>
                </div>
              )}

              {/* Success Rate */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Taux succès</span>
                  <span className="text-xs font-semibold">
                    {stats.indexing.success_rate}%
                  </span>
                </div>
                <Progress value={stats.indexing.success_rate} className="h-2" />
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
                  {stats.crawls.active_jobs} job{stats.crawls.active_jobs > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Pages Crawled Today */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Pages crawlées</span>
                <Badge className="bg-green-500">{stats.crawls.pages_crawled_today}</Badge>
              </div>

              {/* Total Pages */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total pages</span>
                <Badge variant="outline">{stats.crawls.total_pages_today}</Badge>
              </div>

              {/* Avg Duration */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Durée moy.</span>
                <span className="text-sm font-mono">
                  {stats.crawls.avg_duration_s}s
                </span>
              </div>

              {/* Progress */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Progression</span>
                  <span className="text-xs font-semibold">
                    {Math.round(
                      (stats.crawls.pages_crawled_today /
                        stats.crawls.total_pages_today) *
                        100
                    )}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    (stats.crawls.pages_crawled_today / stats.crawls.total_pages_today) *
                    100
                  }
                  className="h-2"
                />
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
              {/* Queue */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En file d'attente</span>
                <Badge variant="outline">{stats.quality.queue}</Badge>
              </div>

              {/* Processing */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">En traitement</span>
                <Badge className="bg-blue-500">
                  {stats.quality.processing} doc{stats.quality.processing > 1 ? 's' : ''}
                </Badge>
              </div>

              {/* Success Rate */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Taux succès</span>
                <Badge
                  className={
                    stats.quality.success_rate >= 90 ? 'bg-green-500' : 'bg-yellow-500'
                  }
                >
                  {stats.quality.success_rate}%
                </Badge>
              </div>

              {/* Avg Score */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Score moyen</span>
                <span className="text-lg font-bold">{stats.quality.avg_score}</span>
              </div>

              {/* Quality Progress */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Qualité</span>
                  <span className="text-xs font-semibold">
                    {stats.quality.avg_score >= 80 ? 'Excellent' : 'Bon'}
                  </span>
                </div>
                <Progress value={stats.quality.avg_score} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
