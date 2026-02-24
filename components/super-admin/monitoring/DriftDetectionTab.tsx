'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Activity,
  Loader2,
} from 'lucide-react'

interface DriftAlert {
  metric: string
  current: number
  previous: number
  changePercent: number
  severity: 'info' | 'warning' | 'critical'
  message: string
}

interface DriftMetricsByDomain {
  domain: string
  avgSimilarity: number | null
  abstentionRate: number | null
  totalQuestions: number
}

interface DriftMetrics {
  period: { from: string; to: string }
  metrics: {
    avgSimilarity: number | null
    abstentionRate: number | null
    hallucinationRate: number | null
    avgFeedbackRating: number | null
    satisfactionRate: number | null
    totalConversations: number
    byDomain?: DriftMetricsByDomain[]
  }
}

interface DriftReport {
  currentPeriod: DriftMetrics
  previousPeriod: DriftMetrics
  alerts: DriftAlert[]
  overallStatus: 'stable' | 'warning' | 'degraded'
  generatedAt: string
}

export function DriftDetectionTab() {
  const [report, setReport] = useState<DriftReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReport = useCallback(async (days: number = 7) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/monitoring/drift?days=${days}`)
      if (!res.ok) throw new Error('Erreur chargement rapport drift')
      const data = await res.json()
      setReport(data.report)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  const statusConfig = {
    stable: { color: 'bg-green-100 text-green-700', icon: CheckCircle2, label: 'Stable' },
    warning: { color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle, label: 'Warning' },
    degraded: { color: 'bg-red-100 text-red-700', icon: TrendingDown, label: 'Dégradé' },
  }

  const renderMetricValue = (value: number | null, suffix: string = '', decimals: number = 1) => {
    if (value == null) return <span className="text-muted-foreground">—</span>
    return <span>{value.toFixed(decimals)}{suffix}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Drift Detection RAG</h2>
          <p className="text-sm text-muted-foreground">
            Compare les métriques RAG de la semaine courante avec la précédente
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => fetchReport(7)} variant="outline" size="sm" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            7 jours
          </Button>
          <Button onClick={() => fetchReport(14)} variant="outline" size="sm" disabled={loading}>
            14 jours
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-200">
          <CardContent className="py-4 text-red-600">{error}</CardContent>
        </Card>
      )}

      {!report && !loading && !error && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Cliquez sur un bouton pour générer le rapport de drift.
          </CardContent>
        </Card>
      )}

      {report && (
        <>
          {/* Status global */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {(() => {
                    const cfg = statusConfig[report.overallStatus]
                    const Icon = cfg.icon
                    return (
                      <>
                        <Badge className={cfg.color}><Icon className="h-4 w-4 mr-1" />{cfg.label}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {report.alerts.length} alerte{report.alerts.length !== 1 ? 's' : ''}
                        </span>
                      </>
                    )
                  })()}
                </div>
                <span className="text-xs text-muted-foreground">
                  Généré le {new Date(report.generatedAt).toLocaleString('fr-FR')}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Alertes */}
          {report.alerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> Alertes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border-l-4 ${
                      alert.severity === 'critical'
                        ? 'border-red-500 bg-red-50'
                        : 'border-yellow-500 bg-yellow-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'critical' ? 'destructive' : 'outline'} className="text-xs">
                        {alert.severity}
                      </Badge>
                      <span className="text-sm font-medium">{alert.metric}</span>
                    </div>
                    <p className="text-sm mt-1">{alert.message}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Comparaison métriques */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { label: 'Période courante', data: report.currentPeriod },
              { label: 'Période précédente', data: report.previousPeriod },
            ].map(({ label, data }) => (
              <Card key={label}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" /> {label}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{data.period.from} → {data.period.to}</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Similarité moy.</span>
                      {renderMetricValue(data.metrics.avgSimilarity, '', 3)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Taux abstention</span>
                      {renderMetricValue(data.metrics.abstentionRate, '%')}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Taux hallucination</span>
                      {renderMetricValue(data.metrics.hallucinationRate, '%')}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Satisfaction</span>
                      {renderMetricValue(data.metrics.satisfactionRate, '%')}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Note moy.</span>
                      {renderMetricValue(data.metrics.avgFeedbackRating, '/5')}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Conversations</span>
                      <span>{data.metrics.totalConversations}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Ventilation par domaine (période courante) */}
          {report.currentPeriod.metrics.byDomain && report.currentPeriod.metrics.byDomain.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Ventilation par domaine juridique
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Période courante — permet de détecter un drift localisé à un domaine
                </p>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Domaine</th>
                        <th className="text-right py-2 px-4 font-medium">Similarité</th>
                        <th className="text-right py-2 px-4 font-medium">Abstention</th>
                        <th className="text-right py-2 pl-4 font-medium">Questions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.currentPeriod.metrics.byDomain.map((d) => {
                        const prevDomain = report.previousPeriod.metrics.byDomain?.find(pd => pd.domain === d.domain)
                        const simDelta = (d.avgSimilarity != null && prevDomain?.avgSimilarity != null)
                          ? d.avgSimilarity - prevDomain.avgSimilarity
                          : null
                        return (
                          <tr key={d.domain} className="border-b hover:bg-muted/30">
                            <td className="py-2 pr-4 font-medium capitalize">{d.domain}</td>
                            <td className="text-right py-2 px-4">
                              {d.avgSimilarity != null ? (
                                <span className="flex items-center justify-end gap-1">
                                  {d.avgSimilarity.toFixed(3)}
                                  {simDelta != null && (
                                    <span className={`text-xs ${simDelta < -0.05 ? 'text-red-600' : simDelta > 0.01 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                      ({simDelta > 0 ? '+' : ''}{simDelta.toFixed(3)})
                                    </span>
                                  )}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="text-right py-2 px-4">
                              {d.abstentionRate != null ? (
                                <span className={d.abstentionRate > 15 ? 'text-red-600 font-medium' : ''}>
                                  {d.abstentionRate.toFixed(1)}%
                                </span>
                              ) : '—'}
                            </td>
                            <td className="text-right py-2 pl-4 text-muted-foreground">{d.totalQuestions}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
