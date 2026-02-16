'use client'

/**
 * Section Alertes Patterns Intelligentes
 * S1.3 : Détection automatique patterns anormaux
 * - Dégradation durée +50%
 * - Intermittence succès/échec
 * - Timeouts répétés
 * - Crons stuck
 */

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { RefreshCw, AlertTriangle, AlertCircle, Info, TrendingUp, Zap, Clock, StopCircle } from 'lucide-react'

interface AlertPattern {
  id: string
  cronName: string
  severity: 'critical' | 'warning' | 'info'
  pattern: 'degradation' | 'intermittent' | 'timeout' | 'stuck'
  title: string
  description: string
  metrics: {
    current: number
    previous: number
    change: number
  }
  detectedAt: string
}

interface AlertStats {
  total: number
  critical: number
  warning: number
  info: number
  byPattern: {
    degradation: number
    intermittent: number
    timeout: number
    stuck: number
  }
}

export function CronsAlertsSection() {
  const [alerts, setAlerts] = useState<AlertPattern[]>([])
  const [stats, setStats] = useState<AlertStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/admin/cron-executions/alerts')
      const data = await response.json()

      if (data.success) {
        setAlerts(data.alerts || [])
        setStats(data.stats || null)
      }
    } catch (error) {
      console.error('[Alerts] Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()

    // Auto-refresh toutes les 60s
    const interval = setInterval(fetchAlerts, 60000)

    return () => clearInterval(interval)
  }, [])

  const getPatternIcon = (pattern: string) => {
    const icons = {
      degradation: TrendingUp,
      intermittent: Zap,
      timeout: Clock,
      stuck: StopCircle,
    }
    return icons[pattern as keyof typeof icons] || AlertCircle
  }

  const getPatternColor = (pattern: string) => {
    const colors = {
      degradation: 'text-orange-500',
      intermittent: 'text-yellow-500',
      timeout: 'text-red-500',
      stuck: 'text-red-600',
    }
    return colors[pattern as keyof typeof colors] || 'text-gray-500'
  }

  const getSeverityBadge = (severity: string) => {
    const config = {
      critical: { variant: 'destructive' as const, label: 'Critique', className: '' },
      warning: { variant: 'default' as const, label: 'Attention', className: 'bg-yellow-500' },
      info: { variant: 'outline' as const, label: 'Info', className: '' },
    }
    const { variant, label, className } = config[severity as keyof typeof config] || config.info

    return (
      <Badge variant={variant} className={className || undefined}>
        {label}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">Alertes Intelligentes</h3>
          <p className="text-sm text-muted-foreground">
            Détection automatique de patterns anormaux
          </p>
        </div>
        {stats && stats.total > 0 && (
          <div className="flex gap-2">
            {stats.critical > 0 && (
              <Badge variant="destructive">{stats.critical} critique{stats.critical > 1 ? 's' : ''}</Badge>
            )}
            {stats.warning > 0 && (
              <Badge variant="default" className="bg-yellow-500">
                {stats.warning} warning{stats.warning > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* KPIs Patterns */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.byPattern.degradation}</div>
                  <div className="text-xs text-muted-foreground">Dégradations</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.byPattern.intermittent}</div>
                  <div className="text-xs text-muted-foreground">Intermittences</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-red-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.byPattern.timeout}</div>
                  <div className="text-xs text-muted-foreground">Timeouts</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <StopCircle className="h-4 w-4 text-red-600" />
                <div>
                  <div className="text-2xl font-bold">{stats.byPattern.stuck}</div>
                  <div className="text-xs text-muted-foreground">Bloqués</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Liste Alertes */}
      {alerts.length > 0 ? (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const Icon = getPatternIcon(alert.pattern)
            const iconColor = getPatternColor(alert.pattern)

            return (
              <Alert
                key={alert.id}
                variant={alert.severity === 'critical' ? 'destructive' : 'default'}
                className={
                  alert.severity === 'warning'
                    ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30'
                    : ''
                }
              >
                <Icon className={`h-4 w-4 ${iconColor}`} />
                <div className="flex items-start justify-between flex-1">
                  <div className="flex-1">
                    <AlertTitle className="flex items-center gap-2">
                      {alert.cronName}
                      {getSeverityBadge(alert.severity)}
                    </AlertTitle>
                    <AlertDescription>
                      <div className="mt-2">
                        <div className="font-semibold">{alert.title}</div>
                        <div className="text-sm mt-1">{alert.description}</div>

                        {/* Métriques comparées */}
                        <div className="mt-2 flex gap-4 text-xs">
                          <div>
                            <span className="text-muted-foreground">Avant: </span>
                            <span className="font-mono">{alert.metrics.previous}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Maintenant: </span>
                            <span className="font-mono">{alert.metrics.current}</span>
                          </div>
                          {alert.metrics.change !== 0 && (
                            <div>
                              <span className="text-muted-foreground">Évolution: </span>
                              <span
                                className={`font-mono font-semibold ${
                                  alert.metrics.change > 0 ? 'text-red-500' : 'text-green-500'
                                }`}
                              >
                                {alert.metrics.change > 0 ? '+' : ''}
                                {alert.metrics.change}%
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </AlertDescription>
                  </div>

                  <div className="text-xs text-muted-foreground text-right">
                    {new Date(alert.detectedAt).toLocaleString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </Alert>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Info className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <div className="text-lg font-medium">Aucune alerte détectée</div>
              <div className="text-sm">Tous les crons fonctionnent normalement</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
