'use client'

/**
 * KPI Cards pour Crons Monitoring
 * 4 métriques principales : Exécutions 24h, En Cours, Échecs, Prochaine Exécution
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Clock, AlertTriangle, Timer } from 'lucide-react'

interface CronsKPICardsProps {
  stats: any
  schedules: any
}

export function CronsKPICards({ stats, schedules }: CronsKPICardsProps) {
  if (!stats || !schedules) {
    return null
  }

  // KPI 1: Exécutions 24h
  const totalExecutions24h = stats.stats?.reduce(
    (sum: number, s: any) => sum + (s.total_executions || 0),
    0
  ) || 0

  const completedExecutions24h = stats.stats?.reduce(
    (sum: number, s: any) => sum + (s.completed_count || 0),
    0
  ) || 0

  const failedExecutions24h = stats.stats?.reduce(
    (sum: number, s: any) => sum + (s.failed_count || 0),
    0
  ) || 0

  const successRate24h =
    totalExecutions24h > 0
      ? Math.round((completedExecutions24h / totalExecutions24h) * 100)
      : 0

  // KPI 2: En Cours
  const runningCount = schedules.summary?.runningNow || 0

  const longestRunning = stats.stats
    ?.filter((s: any) => s.running_count > 0)
    .sort((a: any, b: any) => {
      const aDuration = a.avg_duration_ms || 0
      const bDuration = b.avg_duration_ms || 0
      return bDuration - aDuration
    })[0]

  // KPI 3: Derniers Échecs
  const failures24h = schedules.summary?.recentFailures || 0

  const lastFailedCron = stats.stats
    ?.filter((s: any) => s.last_failure_at)
    .sort((a: any, b: any) => {
      return (
        new Date(b.last_failure_at).getTime() - new Date(a.last_failure_at).getTime()
      )
    })[0]

  // KPI 4: Prochaine Exécution
  const nextCron = schedules.schedules
    ?.filter((s: any) => s.is_enabled && s.next_execution_at)
    .sort((a: any, b: any) => {
      return (
        new Date(a.next_execution_at).getTime() -
        new Date(b.next_execution_at).getTime()
      )
    })[0]

  const nextExecutionCountdown = nextCron?.next_execution_at
    ? Math.max(
        0,
        Math.round(
          (new Date(nextCron.next_execution_at).getTime() - Date.now()) / 1000 / 60
        )
      )
    : null

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* KPI 1: Exécutions 24h */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Exécutions 24h</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{totalExecutions24h}</div>
          <p className="text-xs text-muted-foreground">
            {completedExecutions24h} succès • {failedExecutions24h} échecs
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Progress value={successRate24h} className="h-2 flex-1" />
            <Badge
              variant={successRate24h >= 90 ? 'default' : 'destructive'}
              className="text-xs"
            >
              {successRate24h}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* KPI 2: En Cours */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">En Cours</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{runningCount}</div>
          <p className="text-xs text-muted-foreground">
            {runningCount === 0 ? (
              'Aucun cron actif'
            ) : longestRunning ? (
              <>
                Plus long : {longestRunning.cron_name}
                <br />
                {Math.round((longestRunning.avg_duration_ms || 0) / 1000)}s moy.
              </>
            ) : (
              'Crons en cours'
            )}
          </p>
          {runningCount > 0 && (
            <Badge variant="outline" className="mt-2">
              {runningCount} actif{runningCount > 1 ? 's' : ''}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* KPI 3: Derniers Échecs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Échecs 24h</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{failures24h}</div>
          <p className="text-xs text-muted-foreground">
            {lastFailedCron ? (
              <>
                Dernier : {lastFailedCron.cron_name}
                <br />
                {new Date(lastFailedCron.last_failure_at).toLocaleString('fr-FR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </>
            ) : (
              'Aucun échec récent'
            )}
          </p>
          {failures24h > 0 && (
            <Badge variant="destructive" className="mt-2">
              {failures24h} échec{failures24h > 1 ? 's' : ''}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* KPI 4: Prochaine Exécution */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Prochaine Exéc.</CardTitle>
          <Timer className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {nextExecutionCountdown !== null ? `${nextExecutionCountdown}min` : 'N/A'}
          </div>
          <p className="text-xs text-muted-foreground">
            {nextCron ? (
              <>
                {nextCron.display_name}
                <br />à{' '}
                {new Date(nextCron.next_execution_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </>
            ) : (
              'Aucun cron planifié'
            )}
          </p>
          {nextCron && (
            <Badge variant="outline" className="mt-2 text-xs">
              {nextCron.cron_expression}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
