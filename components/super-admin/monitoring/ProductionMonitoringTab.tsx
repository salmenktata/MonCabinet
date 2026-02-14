'use client'

/**
 * Tab Production Monitoring - Métriques temps réel
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Shield,
  AlertCircle,
} from 'lucide-react'

interface ProductionMetrics {
  queriesPerHour: number
  activeUsers: number
  peakConcurrency: number
  averageRating: number
  hallucinationRate: number
  citationAccuracy: number
  latencyP50: number
  latencyP95: number
  errorRate: number
  costPerQuery: number
  monthlyBudget: number
}

interface TimeSeriesData {
  timestamp: string
  queries: number
  latency: number
  errors: number
  cost: number
}

interface AlertConfig {
  id: string
  name: string
  threshold: number
  currentValue: number
  status: 'ok' | 'warning' | 'critical'
  severity: 'low' | 'medium' | 'high'
}

const THRESHOLDS = {
  queries_per_hour: 150,
  latency_p95_ms: 8000,
  error_rate_percent: 0.5,
  hallucination_rate_percent: 0.1,
  cost_per_query_tnd: 0.05,
}

// Helper pour protéger toFixed() contre valeurs non-numériques
function safeToFixed(value: number | null | undefined, decimals: number = 2): string {
  if (typeof value !== 'number' || isNaN(value)) return '0.' + '0'.repeat(decimals)
  return value.toFixed(decimals)
}

export function ProductionMonitoringTab() {
  const [metrics, setMetrics] = useState<ProductionMetrics | null>(null)
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([])
  const [alerts, setAlerts] = useState<AlertConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h')
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    fetchMetrics()

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000) // Refresh every 30s
      return () => clearInterval(interval)
    }
  }, [autoRefresh, timeRange])

  async function fetchMetrics() {
    try {
      const [metricsRes, timeSeriesRes] = await Promise.all([
        fetch(`/api/admin/production-monitoring/metrics?range=${timeRange}`),
        fetch(`/api/admin/production-monitoring/timeseries?range=${timeRange}`),
      ])

      if (metricsRes.ok && timeSeriesRes.ok) {
        const metricsData = await metricsRes.json()
        const timeSeriesData = await timeSeriesRes.json()

        setMetrics(metricsData.metrics)
        setTimeSeriesData(timeSeriesData.data)
        setAlerts(generateAlerts(metricsData.metrics))
      }
    } catch (error) {
      console.error('Failed to fetch monitoring metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  function generateAlerts(metrics: ProductionMetrics): AlertConfig[] {
    const alerts: AlertConfig[] = []

    alerts.push({
      id: 'queries_per_hour',
      name: 'Queries par Heure',
      threshold: THRESHOLDS.queries_per_hour,
      currentValue: metrics.queriesPerHour || 0,
      status:
        metrics.queriesPerHour > THRESHOLDS.queries_per_hour
          ? 'critical'
          : metrics.queriesPerHour > THRESHOLDS.queries_per_hour * 0.8
          ? 'warning'
          : 'ok',
      severity: 'high',
    })

    alerts.push({
      id: 'latency_p95',
      name: 'Latence P95',
      threshold: THRESHOLDS.latency_p95_ms,
      currentValue: metrics.latencyP95 || 0,
      status:
        metrics.latencyP95 > THRESHOLDS.latency_p95_ms
          ? 'critical'
          : metrics.latencyP95 > THRESHOLDS.latency_p95_ms * 0.8
          ? 'warning'
          : 'ok',
      severity: 'medium',
    })

    alerts.push({
      id: 'error_rate',
      name: 'Taux d\'Erreur',
      threshold: THRESHOLDS.error_rate_percent,
      currentValue: metrics.errorRate || 0,
      status:
        metrics.errorRate > THRESHOLDS.error_rate_percent
          ? 'critical'
          : metrics.errorRate > THRESHOLDS.error_rate_percent * 0.8
          ? 'warning'
          : 'ok',
      severity: 'high',
    })

    alerts.push({
      id: 'hallucination_rate',
      name: 'Taux Hallucination',
      threshold: THRESHOLDS.hallucination_rate_percent,
      currentValue: metrics.hallucinationRate || 0,
      status:
        metrics.hallucinationRate > THRESHOLDS.hallucination_rate_percent
          ? 'critical'
          : metrics.hallucinationRate > THRESHOLDS.hallucination_rate_percent * 0.5
          ? 'warning'
          : 'ok',
      severity: 'high',
    })

    alerts.push({
      id: 'cost_per_query',
      name: 'Coût par Requête',
      threshold: THRESHOLDS.cost_per_query_tnd,
      currentValue: metrics.costPerQuery || 0,
      status:
        metrics.costPerQuery > THRESHOLDS.cost_per_query_tnd
          ? 'critical'
          : metrics.costPerQuery > THRESHOLDS.cost_per_query_tnd * 0.8
          ? 'warning'
          : 'ok',
      severity: 'medium',
    })

    return alerts
  }

  const criticalAlerts = alerts.filter(a => a.status === 'critical')
  const warningAlerts = alerts.filter(a => a.status === 'warning')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 animate-pulse text-primary" />
          <p className="mt-4 text-muted-foreground">Chargement métriques production...</p>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Impossible de charger les métriques. Vérifiez la connexion à la base de données.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Production Overview</h2>
          <p className="text-sm text-muted-foreground">
            Métriques temps réel système RAG Qadhya
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex gap-2">
            <Button
              variant={timeRange === '1h' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('1h')}
            >
              1h
            </Button>
            <Button
              variant={timeRange === '24h' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('24h')}
            >
              24h
            </Button>
            <Button
              variant={timeRange === '7d' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('7d')}
            >
              7j
            </Button>
          </div>

          {/* Auto-refresh Toggle */}
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Auto (30s)' : 'Manuel'}
          </Button>
        </div>
      </div>

      {/* Critical Alerts Banner */}
      {criticalAlerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{criticalAlerts.length} alerte(s) critique(s) :</strong>
            <ul className="mt-2 ml-4 list-disc">
              {criticalAlerts.map(alert => (
                <li key={alert.id}>
                  {alert.name} : {safeToFixed(alert.currentValue, 2)}{' '}
                  {alert.id.includes('rate') ? '%' : alert.id.includes('cost') ? 'TND' : 'ms'} (seuil :{' '}
                  {alert.threshold})
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warning Alerts */}
      {warningAlerts.length > 0 && criticalAlerts.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {warningAlerts.length} alerte(s) avertissement : Surveillance recommandée
          </AlertDescription>
        </Alert>
      )}

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Volume Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Queries/Heure</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.queriesPerHour}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.queriesPerHour < THRESHOLDS.queries_per_hour ? (
                <span className="flex items-center gap-1 text-green-600">
                  <TrendingDown className="h-3 w-3" />
                  Normal
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-600">
                  <TrendingUp className="h-3 w-3" />
                  Saturation
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        {/* Users Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Utilisateurs Actifs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeUsers}</div>
            <p className="text-xs text-muted-foreground">
              Peak concurrency : {metrics.peakConcurrency}
            </p>
          </CardContent>
        </Card>

        {/* Latency Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Latence P95</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeToFixed((metrics.latencyP95 || 0) / 1000, 2)}s</div>
            <p className="text-xs text-muted-foreground">
              P50 : {safeToFixed((metrics.latencyP50 || 0) / 1000, 2)}s
            </p>
          </CardContent>
        </Card>

        {/* Cost Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Coût/Query</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeToFixed(metrics.costPerQuery, 3)} TND</div>
            <p className="text-xs text-muted-foreground">
              Budget mensuel : {safeToFixed(metrics.monthlyBudget, 2)} TND
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Métriques détaillées */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="quality">Qualité</TabsTrigger>
          <TabsTrigger value="cost">Coûts</TabsTrigger>
          <TabsTrigger value="alerts">Alertes</TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Latence Requêtes (P50 / P95)</CardTitle>
              <CardDescription>Évolution latence sur {timeRange}</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  />
                  <YAxis label={{ value: 'Latence (ms)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="latency" stroke="#8884d8" name="Latence" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Taux d'Erreur</CardTitle>
                <CardDescription>Objectif : &lt; 0.5%</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-4xl font-bold">{safeToFixed(metrics.errorRate, 2)}%</div>
                  {metrics.errorRate < THRESHOLDS.error_rate_percent ? (
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-12 w-12 text-red-600" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Volume Requêtes</CardTitle>
                <CardDescription>Queries par heure</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit' })}
                    />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="queries" stroke="#82ca9d" fill="#82ca9d" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Rating Moyen</CardTitle>
                <CardDescription>Objectif : &gt; 4.2/5</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{safeToFixed(metrics.averageRating, 2)}/5</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.averageRating >= 4.2 ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Objectif atteint
                    </span>
                  ) : (
                    <span className="text-orange-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Amélioration requise
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Hallucination Rate</CardTitle>
                <CardDescription>Objectif : &lt; 0.1%</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{safeToFixed(metrics.hallucinationRate, 3)}%</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.hallucinationRate < THRESHOLDS.hallucination_rate_percent ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      Sécurisé
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      CRITIQUE
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Citation Accuracy</CardTitle>
                <CardDescription>Objectif : &gt; 95%</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{safeToFixed(metrics.citationAccuracy, 1)}%</div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.citationAccuracy >= 95 ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Excellent
                    </span>
                  ) : (
                    <span className="text-orange-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      À surveiller
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cost Tab */}
        <TabsContent value="cost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Évolution Coûts</CardTitle>
              <CardDescription>Coût cumulé par heure</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit' })}
                  />
                  <YAxis label={{ value: 'Coût (TND)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cost" fill="#ffc658" name="Coût" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Budget Mensuel Projection</CardTitle>
                <CardDescription>Basé sur usage actuel</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{safeToFixed(metrics.monthlyBudget, 2)} TND</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Objectif : &lt; 200 TND/mois
                  {metrics.monthlyBudget < 200 ? (
                    <span className="ml-2 text-green-600">✓ OK</span>
                  ) : (
                    <span className="ml-2 text-red-600">✗ Dépassement</span>
                  )}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Coût par Requête</CardTitle>
                <CardDescription>Moyenne dernières {timeRange}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{safeToFixed(metrics.costPerQuery, 4)} TND</div>
                <p className="text-xs text-muted-foreground mt-2">
                  Objectif : &lt; 0.03 TND
                  {metrics.costPerQuery < 0.03 ? (
                    <span className="ml-2 text-green-600">✓ Économique</span>
                  ) : (
                    <span className="ml-2 text-orange-600">! Optimisation requise</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuration Alertes</CardTitle>
              <CardDescription>Seuils automatiques de notification (SMS/Email)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      {alert.status === 'ok' ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : alert.status === 'warning' ? (
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                      ) : (
                        <AlertTriangle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">{alert.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Seuil : {alert.threshold}
                          {alert.id.includes('rate') ? '%' : alert.id.includes('cost') ? ' TND' : ' ms'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-bold">
                          {safeToFixed(alert.currentValue, 2)}
                          {alert.id.includes('rate') ? '%' : alert.id.includes('cost') ? ' TND' : ' ms'}
                        </p>
                        <Badge
                          variant={
                            alert.status === 'ok'
                              ? 'default'
                              : alert.status === 'warning'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {alert.status === 'ok'
                            ? 'Normal'
                            : alert.status === 'warning'
                            ? 'Avertissement'
                            : 'Critique'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
