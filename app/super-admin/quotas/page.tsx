'use client'

import { useState, useEffect, useCallback } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Icons } from '@/lib/icons'
import { QuotaKPICards } from '@/components/super-admin/quotas/QuotaKPICards'
import { RateLimitsTable } from '@/components/super-admin/quotas/RateLimitsTable'
import { ConsumptionTabs } from '@/components/super-admin/quotas/ConsumptionTabs'
import { DailyHistoryTable } from '@/components/super-admin/quotas/DailyHistoryTable'
import { CostForecastChart } from '@/components/super-admin/quotas/CostForecastChart'

interface UnifiedQuotaData {
  summary: {
    totalCostMonthUsd: number
    forecastEndOfMonthUsd: number
    forecastDaysRemaining: number
    topProviderByTokens: string
    topProviderByCost: string
    totalRequestsToday: number
    activeAlerts: string[]
    currentDate: string
    daysElapsed: number
    daysInMonth: number
  }
  rateLimits: Array<{
    provider: string
    model: string
    tier: 'free' | 'paid' | 'local'
    limitType: 'RPD' | 'TPD' | 'RPM' | 'TPM' | 'Budget'
    limitValue: number | null
    unit?: string
    usedToday: number
    percentUsed: number
    status: 'ok' | 'warning' | 'critical' | 'unlimited' | 'no_data'
    source: 'redis' | 'db'
  }>
  dailyTrend: Array<{
    date: string
    byProvider: Record<string, { tokens: number; cost: number; requests: number }>
    total: { tokens: number; cost: number; requests: number }
  }>
  topUsers: Array<{
    userId: string
    email: string | null
    name: string | null
    totalTokens: number
    totalCostUsd: number
    requestsCount: number
  }>
  byOperation: Array<{
    operationType: string
    provider: string
    model: string | null
    requests: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd: number
  }>
}

const AUTO_REFRESH_MS = 5 * 60 * 1000 // 5 minutes

export default function QuotasPage() {
  const [data, setData] = useState<UnifiedQuotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/quotas/unified')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const json = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Auto-refresh toutes les 5 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchData(true), AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center gap-3">
        <Icons.loader className="h-6 w-6 animate-spin" />
        <span className="text-muted-foreground">Chargement des données...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <Icons.alertTriangle className="h-4 w-4" />
          <AlertTitle>Erreur de chargement</AlertTitle>
          <AlertDescription>
            {error}
            <button
              onClick={() => fetchData()}
              className="ml-4 underline hover:no-underline"
            >
              Réessayer
            </button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) return null

  const hasAlerts = data.summary.activeAlerts.length > 0

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Coûts & Limites IA</h1>
          <p className="text-muted-foreground mt-1">
            Suivi en temps réel des quotas, consommation tokens et prévision de coût par provider
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Màj {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition-opacity text-sm"
          >
            <Icons.refresh className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ── Alerte globale ────────────────────────────────────────────────── */}
      {hasAlerts && (
        <Alert className="border-red-500/50 bg-red-500/5">
          <Icons.alertTriangle className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-500">Limites critiques détectées</AlertTitle>
          <AlertDescription>
            {data.summary.activeAlerts.join(' · ')}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Section 1 : KPIs ──────────────────────────────────────────────── */}
      <QuotaKPICards summary={data.summary} />

      {/* ── Section 2 : Limites temps réel ───────────────────────────────── */}
      <RateLimitsTable rateLimits={data.rateLimits} />

      {/* ── Section 3 : Consommation / Users / Opérations ────────────────── */}
      <ConsumptionTabs
        dailyTrend={data.dailyTrend}
        topUsers={data.topUsers}
        byOperation={data.byOperation}
      />

      {/* ── Section 4 : Historique 30j ────────────────────────────────────── */}
      <DailyHistoryTable dailyTrend={data.dailyTrend} />

      {/* ── Section 5 : Prévision de coût ────────────────────────────────── */}
      <CostForecastChart dailyTrend={data.dailyTrend} forecast={data.summary} />
    </div>
  )
}
