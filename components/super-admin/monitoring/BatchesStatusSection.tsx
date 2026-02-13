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
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
