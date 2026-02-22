'use client'

/**
 * Tab KB Quality - Suivi analyse qualité base de connaissances
 *
 * Affiche :
 * - Budget OpenAI pour l'analyse KB
 * - Progression batch overnight
 * - Taux de succès par provider
 * - Distribution scores
 * - Échecs récents
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from '@/components/charts/LazyCharts'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  RefreshCw,
  TrendingUp,
  Clock,
  Sparkles,
  FileText,
} from 'lucide-react'

interface MonitoringMetrics {
  timestamp: string
  global: {
    totalIndexed: number
    totalAnalyzed: number
    totalNotAnalyzed: number
    avgQualityScore: number
    totalChunks: number
    coverage: number
  }
  budget: {
    monthlyBudgetUsd: number
    estimatedCostUsd: number
    remainingUsd: number
    percentUsed: number
    openaiDocuments: number
    openaiShortDocs: number
    note: string
  }
  providers: Array<{
    provider: string
    count: number
    avgScore: number
    successRate: number
  }>
  timeline: Array<{
    date: string
    analyzed: number
    openai: number
    gemini: number
    ollama: number
    avgScore: number
  }>
  scoreDistribution: Array<{
    range: string
    count: number
  }>
  failures: {
    total: number
    shortDocs: number
    longDocs: number
  }
}

const COLORS = {
  openai: '#10b981',
  gemini: '#3b82f6',
  ollama: '#f59e0b',
  deepseek: '#8b5cf6',
  groq: '#ec4899',
}

export function KBQualityTab() {
  const [metrics, setMetrics] = useState<MonitoringMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [enrichLoading, setEnrichLoading] = useState(false)
  const [rechunkArticlesLoading, setRechunkArticlesLoading] = useState(false)
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleEnrichMetadata = async () => {
    setEnrichLoading(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/admin/kb/enrich-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10, reanalyzeAfter: true }),
      })
      const data = await res.json()
      if (data.success) {
        setActionResult({ type: 'success', message: data.message || `${data.enriched} docs enrichis` })
      } else {
        setActionResult({ type: 'error', message: data.error || 'Erreur enrichissement' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Erreur réseau' })
    } finally {
      setEnrichLoading(false)
    }
  }

  const handleRechunkArticles = async () => {
    setRechunkArticlesLoading(true)
    setActionResult(null)
    try {
      const res = await fetch('/api/admin/kb/reindex-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 3 }),
      })
      const data = await res.json()
      if (data.success) {
        setActionResult({ type: 'success', message: data.message || `${data.processed} docs rechunkés par articles` })
      } else {
        setActionResult({ type: 'error', message: data.error || 'Erreur rechunk articles' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Erreur réseau' })
    } finally {
      setRechunkArticlesLoading(false)
    }
  }

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch('/api/admin/monitoring/metrics')
      if (!response.ok) throw new Error('Erreur lors du chargement des métriques')
      const data = await response.json()
      setMetrics(data)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMetrics()
    // Auto-refresh toutes les 30 secondes
    const interval = setInterval(fetchMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !metrics) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Chargement métriques KB...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
          <p className="mt-4 text-sm text-muted-foreground">{error}</p>
          <Button onClick={fetchMetrics} className="mt-4">
            Réessayer
          </Button>
        </div>
      </div>
    )
  }

  if (!metrics) return null

  const budgetAlertLevel =
    metrics.budget.percentUsed >= 80 ? 'critical' :
    metrics.budget.percentUsed >= 60 ? 'warning' : 'ok'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Analyse Qualité KB</h2>
          <p className="text-sm text-muted-foreground">
            Suivi batch overnight, budget OpenAI et qualité des documents
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              MAJ : {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <Button
            onClick={handleEnrichMetadata}
            variant="outline"
            size="sm"
            disabled={enrichLoading}
            title="Enrichir descriptions et tags des docs avec métadonnées pauvres (batch 10)"
          >
            <Sparkles className={`h-4 w-4 mr-1 ${enrichLoading ? 'animate-spin' : ''}`} />
            {enrichLoading ? 'Enrichissement...' : 'Enrichir métadonnées'}
          </Button>
          <Button
            onClick={handleRechunkArticles}
            variant="outline"
            size="sm"
            disabled={rechunkArticlesLoading}
            title="Re-chunker par articles les documents codes/legislation (batch 3)"
          >
            <FileText className={`h-4 w-4 mr-1 ${rechunkArticlesLoading ? 'animate-spin' : ''}`} />
            {rechunkArticlesLoading ? 'Rechunk...' : 'Re-chunker articles'}
          </Button>
          <Button
            onClick={fetchMetrics}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Résultat action manuelle */}
      {actionResult && (
        <Alert variant={actionResult.type === 'error' ? 'destructive' : 'default'}>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{actionResult.message}</AlertDescription>
        </Alert>
      )}

      {/* Alertes Critiques */}
      {(budgetAlertLevel !== 'ok' || metrics.failures.total > 0) && (
        <Alert
          variant={budgetAlertLevel === 'critical' || metrics.failures.total > 50 ? 'destructive' : 'default'}
          className={budgetAlertLevel === 'warning' && metrics.failures.total <= 50 ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20' : ''}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              {budgetAlertLevel === 'critical' && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="destructive">Critique</Badge>
                  <span>
                    Budget OpenAI à {metrics.budget.percentUsed.toFixed(1)}% - Basculement
                    sur Ollama recommandé
                  </span>
                </div>
              )}
              {budgetAlertLevel === 'warning' && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge className="bg-yellow-500">Attention</Badge>
                  <span>
                    Budget OpenAI à {metrics.budget.percentUsed.toFixed(1)}% - Surveiller la
                    consommation
                  </span>
                </div>
              )}
              {metrics.failures.total > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant={metrics.failures.total > 50 ? 'destructive' : 'secondary'}>
                    {metrics.failures.total} échecs
                  </Badge>
                  <span>
                    {metrics.failures.shortDocs > 0 && `${metrics.failures.shortDocs} courts`}
                    {metrics.failures.shortDocs > 0 && metrics.failures.longDocs > 0 && ' • '}
                    {metrics.failures.longDocs > 0 && `${metrics.failures.longDocs} longs`}
                    {' - Investigation recommandée'}
                  </span>
                </div>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs Principaux */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Progression Batch</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.global.totalAnalyzed.toLocaleString('fr-FR')}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.global.totalNotAnalyzed.toLocaleString('fr-FR')} restants
            </p>
            <Progress value={metrics.global.coverage} className="mt-2" />
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.global.coverage.toFixed(1)}% complété
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Budget OpenAI</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${metrics.budget.estimatedCostUsd.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              ${metrics.budget.remainingUsd.toFixed(2)} / $
              {metrics.budget.monthlyBudgetUsd} restant
            </p>
            <Progress
              value={metrics.budget.percentUsed}
              className={`mt-2 ${
                budgetAlertLevel === 'critical' ? '[&>div]:bg-destructive' :
                budgetAlertLevel === 'warning' ? '[&>div]:bg-yellow-500' : ''
              }`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {metrics.budget.percentUsed.toFixed(1)}% utilisé
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score Moyen</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.global.avgQualityScore.toFixed(1)}/100
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.global.totalChunks.toLocaleString('fr-FR')} chunks générés
            </p>
            {metrics.global.avgQualityScore >= 80 ? (
              <Badge variant="default" className="mt-2 bg-green-600">
                Excellente qualité
              </Badge>
            ) : metrics.global.avgQualityScore >= 70 ? (
              <Badge variant="secondary" className="mt-2">
                Bonne qualité
              </Badge>
            ) : (
              <Badge variant="destructive" className="mt-2">
                À améliorer
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Échecs</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.failures.total}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.failures.shortDocs} courts • {metrics.failures.longDocs} longs
            </p>
            {metrics.failures.total === 0 ? (
              <Badge variant="default" className="mt-2 bg-green-600">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Aucun échec
              </Badge>
            ) : (
              <Badge variant={metrics.failures.total > 50 ? 'destructive' : 'secondary'} className="mt-2">
                <AlertTriangle className="mr-1 h-3 w-3" />
                À investiguer
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Graphiques Principaux */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Timeline Progression */}
        <Card>
          <CardHeader>
            <CardTitle>Progression Analyse (7 jours)</CardTitle>
            <CardDescription>Documents analysés par provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metrics.timeline}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString('fr-FR', {
                      month: 'short',
                      day: 'numeric',
                    })
                  }
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) =>
                    new Date(value).toLocaleDateString('fr-FR')
                  }
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="openai"
                  stroke={COLORS.openai}
                  strokeWidth={2}
                  name="OpenAI"
                />
                <Line
                  type="monotone"
                  dataKey="gemini"
                  stroke={COLORS.gemini}
                  strokeWidth={2}
                  name="Gemini"
                />
                <Line
                  type="monotone"
                  dataKey="ollama"
                  stroke={COLORS.ollama}
                  strokeWidth={2}
                  name="Ollama"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Distribution Scores */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution Scores Qualité</CardTitle>
            <CardDescription>Répartition par tranche de score</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics.scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" name="Documents" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Performance Providers & Budget Détails */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Performance par Provider */}
        <Card>
          <CardHeader>
            <CardTitle>Performance par Provider</CardTitle>
            <CardDescription>Taux de succès et temps moyen</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.providers.map((provider) => (
                <div key={provider.provider} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            COLORS[provider.provider as keyof typeof COLORS] || '#6b7280',
                        }}
                      />
                      <span className="font-medium capitalize">{provider.provider}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        <span>{provider.count} docs</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        <span>{provider.avgScore}/100</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={provider.successRate} className="flex-1" />
                    <span className="text-sm font-medium">
                      {provider.successRate.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Budget OpenAI Détails */}
        <Card>
          <CardHeader>
            <CardTitle>Détails Budget OpenAI</CardTitle>
            <CardDescription>{metrics.budget.note}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">Documents ce mois</span>
                <span className="font-medium">
                  {metrics.budget.openaiDocuments.toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">Docs courts (&lt;500 chars)</span>
                <span className="font-medium">
                  {metrics.budget.openaiShortDocs.toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">Docs longs (≥500 chars)</span>
                <span className="font-medium">
                  {(metrics.budget.openaiDocuments - metrics.budget.openaiShortDocs).toLocaleString('fr-FR')}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">Coût estimé</span>
                <span className="font-medium">
                  ${metrics.budget.estimatedCostUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between border-b pb-2">
                <span className="text-sm">Budget mensuel</span>
                <span className="font-medium">${metrics.budget.monthlyBudgetUsd}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-medium">Restant</span>
                <span
                  className={`text-lg font-bold ${
                    budgetAlertLevel === 'critical' ? 'text-destructive' :
                    budgetAlertLevel === 'warning' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}
                >
                  ${metrics.budget.remainingUsd.toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Statistiques Globales */}
      <Card>
        <CardHeader>
          <CardTitle>Statistiques Globales KB</CardTitle>
          <CardDescription>Vue d'ensemble de la base de connaissances</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Documents Indexés</p>
              <p className="text-2xl font-bold">
                {metrics.global.totalIndexed.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Analysés</p>
              <p className="text-2xl font-bold">
                {metrics.global.totalAnalyzed.toLocaleString('fr-FR')}
              </p>
              <Badge variant="outline">
                {metrics.global.coverage.toFixed(1)}%
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Non Analysés</p>
              <p className="text-2xl font-bold">
                {metrics.global.totalNotAnalyzed.toLocaleString('fr-FR')}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Chunks RAG</p>
              <p className="text-2xl font-bold">
                {metrics.global.totalChunks.toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
