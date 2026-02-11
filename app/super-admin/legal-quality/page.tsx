/**
 * Page Dashboard - KPIs Qualité Juridique (Phase 5.4)
 *
 * Monitoring temps réel 8 métriques qualité RAG :
 * - Gauges 0-100 avec seuils warning/critical
 * - Historique 7/30 jours
 * - Comparaison baseline (semaine précédente)
 * - Alertes automatiques
 *
 * @module app/super-admin/legal-quality/page
 */

'use client'

import { useState, useEffect } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Activity,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface LegalQualityMetrics {
  citationAccuracy: number
  hallucinationRate: number
  coverageScore: number
  multiPerspectiveRate: number
  freshnessScore: number
  abrogationDetectionRate: number
  actionableRate: number
  lawyerSatisfaction: number
  computedAt: string
}

interface QualityComparison {
  current: LegalQualityMetrics
  previous: LegalQualityMetrics
  changes: Record<string, number>
  alerts: Array<{
    metric: string
    currentValue: number
    threshold: number
    severity: 'warning' | 'critical'
    message: string
  }>
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function LegalQualityPage() {
  const [loading, setLoading] = useState(true)
  const [comparison, setComparison] = useState<QualityComparison | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    loadMetrics()

    // Auto-refresh toutes les 5 minutes
    if (autoRefresh) {
      const interval = setInterval(loadMetrics, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const loadMetrics = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/legal-quality/metrics')
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Erreur ${response.status}: ${errorData.error || response.statusText}`)
      }
      const data = await response.json()
      setComparison(data)
    } catch (error) {
      console.error('[Legal Quality] Erreur:', error)
      alert(`Erreur lors du chargement des métriques: ${error instanceof Error ? error.message : 'Erreur inconnue'}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !comparison) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">
            Chargement métriques qualité...
          </p>
        </div>
      </div>
    )
  }

  if (!comparison) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600 dark:text-gray-400">
          Erreur chargement métriques
        </p>
      </div>
    )
  }

  const { current, changes, alerts } = comparison

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Qualité Juridique
              <Activity className="ml-2 inline-block h-8 w-8 text-blue-600" />
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Monitoring temps réel des 8 KPIs qualité RAG
            </p>
          </div>

          <div className="flex gap-3">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              <span className="text-sm">Auto-refresh (5min)</span>
            </label>

            <button
              onClick={loadMetrics}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Alertes */}
      {alerts.length > 0 && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-red-900 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            {alerts.length} Alerte(s) Qualité
          </h3>
          <ul className="space-y-1 text-sm text-red-800 dark:text-red-400">
            {alerts.map((alert, index) => (
              <li key={index}>{alert.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Gauges Métriques */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricGauge
          title="Précision Citations"
          value={current.citationAccuracy}
          change={changes.citationAccuracy}
          thresholds={{ warning: 90, critical: 80 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Taux Hallucinations"
          value={current.hallucinationRate}
          change={changes.hallucinationRate}
          thresholds={{ warning: 5, critical: 10 }}
          higherIsBetter={false}
        />

        <MetricGauge
          title="Couverture Sources"
          value={current.coverageScore}
          change={changes.coverageScore}
          thresholds={{ warning: 70, critical: 50 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Multi-Perspectives"
          value={current.multiPerspectiveRate}
          change={changes.multiPerspectiveRate}
          thresholds={{ warning: 60, critical: 40 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Fraîcheur Sources"
          value={current.freshnessScore}
          change={changes.freshnessScore}
          thresholds={{ warning: 70, critical: 50 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Détection Abrogations"
          value={current.abrogationDetectionRate}
          change={changes.abrogationDetectionRate}
          thresholds={{ warning: 80, critical: 70 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Recommandations"
          value={current.actionableRate}
          change={changes.actionableRate}
          thresholds={{ warning: 75, critical: 60 }}
          higherIsBetter={true}
        />

        <MetricGauge
          title="Satisfaction Avocats"
          value={current.lawyerSatisfaction}
          change={changes.lawyerSatisfaction}
          thresholds={{ warning: 80, critical: 60 }}
          higherIsBetter={true}
        />
      </div>

      {/* Footer Info */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
        <p>
          Dernière mise à jour :{' '}
          {new Date(current.computedAt).toLocaleString('fr-FR')}
        </p>
        <p className="mt-1">
          Comparaison vs semaine précédente • Seuils: 🟢 OK • 🟡 Warning • 🔴
          Critical
        </p>
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANT GAUGE
// =============================================================================

function MetricGauge({
  title,
  value,
  change,
  thresholds,
  higherIsBetter,
}: {
  title: string
  value: number
  change: number
  thresholds: { warning: number; critical: number }
  higherIsBetter: boolean
}) {
  // Déterminer statut
  let status: 'ok' | 'warning' | 'critical' = 'ok'
  if (higherIsBetter) {
    if (value <= thresholds.critical) status = 'critical'
    else if (value <= thresholds.warning) status = 'warning'
  } else {
    if (value >= thresholds.critical) status = 'critical'
    else if (value >= thresholds.warning) status = 'warning'
  }

  const statusColors = {
    ok: 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20',
    warning:
      'text-yellow-600 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20',
    critical:
      'text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20',
  }

  const gaugeColor = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
  }

  return (
    <div
      className={`rounded-lg border p-4 ${statusColors[status]}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {status === 'ok' ? (
          <CheckCircle className="h-5 w-5" />
        ) : (
          <AlertTriangle className="h-5 w-5" />
        )}
      </div>

      {/* Gauge circulaire */}
      <div className="mb-3 flex items-center justify-center">
        <div className="relative h-24 w-24">
          <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
            {/* Background circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              opacity="0.2"
            />
            {/* Progress circle */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeDasharray={`${(value / 100) * 251.2} 251.2`}
              strokeLinecap="round"
              className={gaugeColor[status]}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-2xl font-bold">{value.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Changement */}
      <div className="flex items-center justify-center gap-1 text-sm">
        {change > 0 ? (
          <TrendingUp className="h-4 w-4" />
        ) : change < 0 ? (
          <TrendingDown className="h-4 w-4" />
        ) : null}
        <span>
          {change > 0 ? '+' : ''}
          {change.toFixed(1)}% vs précédent
        </span>
      </div>
    </div>
  )
}
