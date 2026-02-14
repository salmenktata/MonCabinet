'use client'

/**
 * Onglet Monitoring Crons & Batches
 * Dashboard temps réel de tous les crons automatiques et batches
 */

import { useEffect, useState } from 'react'
import { CronsKPICards } from './CronsKPICards'
import { CronsTimelineChart } from './CronsTimelineChart'
import { CronsExecutionsTable } from './CronsExecutionsTable'
import { BatchesStatusSection } from './BatchesStatusSection'
import { CronQuickTrigger } from './CronQuickTrigger'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CronStats {
  stats: any[]
  timeline: any[]
  stuckCrons: any[]
  hoursBack: number
}

interface Schedule {
  cron_name: string
  display_name: string
  description: string
  cron_expression: string
  is_enabled: boolean
  timeout_ms: number
  last_execution_at: string | null
  last_success_at: string | null
  consecutive_failures: number
  avg_duration_ms: number | null
  success_rate_7d: number | null
  next_execution_at: string | null
  running_count: number
  failures_24h: number
}

interface SchedulesData {
  schedules: Schedule[]
  summary: {
    totalSchedules: number
    enabledSchedules: number
    runningNow: number
    recentFailures: number
    avgSuccessRate: number
  }
}

export function CronsAndBatchesTab() {
  const [stats, setStats] = useState<CronStats | null>(null)
  const [schedules, setSchedules] = useState<SchedulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  const fetchData = async () => {
    try {
      setError(null)

      // Fetch stats et schedules en parallèle
      const [statsRes, schedulesRes] = await Promise.all([
        fetch('/api/admin/cron-executions/stats?hours=24'),
        fetch('/api/admin/cron-schedules'),
      ])

      if (!statsRes.ok || !schedulesRes.ok) {
        throw new Error('Failed to fetch monitoring data')
      }

      const [statsData, schedulesData] = await Promise.all([
        statsRes.json(),
        schedulesRes.json(),
      ])

      setStats(statsData)
      setSchedules(schedulesData)
      setLastUpdate(new Date())
    } catch (err: any) {
      console.error('[Crons Monitoring] Error:', err)
      setError(err.message || 'Erreur lors du chargement des données')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Auto-refresh toutes les 30s
    const interval = setInterval(fetchData, 30000)

    return () => clearInterval(interval)
  }, [])

  // Alertes critiques (crons bloqués, échecs multiples)
  const criticalAlerts = []

  if (stats?.stuckCrons && stats.stuckCrons.length > 0) {
    criticalAlerts.push({
      type: 'stuck',
      message: `${stats.stuckCrons.length} cron(s) bloqué(s) au-delà du timeout`,
      details: stats.stuckCrons,
    })
  }

  if (schedules?.schedules) {
    const criticalFailures = schedules.schedules.filter((s) => s.consecutive_failures >= 3)
    if (criticalFailures.length > 0) {
      criticalAlerts.push({
        type: 'failures',
        message: `${criticalFailures.length} cron(s) avec 3+ échecs consécutifs`,
        details: criticalFailures,
      })
    }
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Chargement...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="ml-4"
          >
            <RefreshCw className="h-3 w-3 mr-2" />
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header avec Last Update */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Crons & Batches</h2>
          <p className="text-sm text-muted-foreground">
            Dernière mise à jour : {lastUpdate.toLocaleTimeString('fr-FR')}
            {' • '}Auto-refresh 30s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </Button>
      </div>

      {/* Alertes Critiques */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-2">
          {criticalAlerts.map((alert, idx) => (
            <Alert key={idx} variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>⚠️ {alert.message}</strong>
                <div className="mt-2 text-xs">
                  {alert.type === 'stuck' &&
                    alert.details.map((cron: any, i: number) => (
                      <div key={i}>
                        • {cron.cron_name} : {Math.round(cron.running_duration_ms / 1000)}s
                        (timeout: {Math.round(cron.timeout_ms / 1000)}s)
                      </div>
                    ))}
                  {alert.type === 'failures' &&
                    alert.details.map((cron: any, i: number) => (
                      <div key={i}>
                        • {cron.display_name} : {cron.consecutive_failures} échecs consécutifs
                      </div>
                    ))}
                </div>
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Section 0: Quick Trigger (Déclenchement Manuel) */}
      <CronQuickTrigger />

      {/* Section 1: KPIs */}
      <CronsKPICards stats={stats} schedules={schedules} />

      {/* Section 2: Timeline Chart */}
      {stats?.timeline && stats.timeline.length > 0 && (
        <CronsTimelineChart data={stats.timeline} />
      )}

      {/* Section 3: Table Historique */}
      <CronsExecutionsTable />

      {/* Section 4: Batches Status */}
      <BatchesStatusSection />
    </div>
  )
}
