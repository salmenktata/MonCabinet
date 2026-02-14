/**
 * Page Dashboard - A/B Testing Prompts (Phase 5.3)
 *
 * Interface admin pour visualiser et gérer tests A/B prompts :
 * - Stats par variant (Control, Variant A, Variant B)
 * - Graphiques comparatifs métriques clés
 * - Test significativité statistique
 * - Bouton "Promouvoir" si critères atteints
 *
 * @module app/super-admin/ab-testing/page
 */

'use client'

import { useState, useEffect } from 'react'
import {
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Award,
  ChevronRight,
  BarChart3,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface VariantMetrics {
  variant: string
  totalConversations: number
  totalFeedbacks: number
  satisfactionRate: number
  avgRating: number
  citationAccuracyRate: number
  avgResponseTime: number
  hallucinationRate: number
  completionRate: number
}

interface StatisticalSignificance {
  pValue: number
  significant: boolean
  improvement: number
}

interface ABTestComparison {
  control: VariantMetrics
  variantA: VariantMetrics
  variantB: VariantMetrics
  statisticalSignificance: {
    variantA: StatisticalSignificance | null
    variantB: StatisticalSignificance | null
  }
  recommendations: string[]
  eligibleForPromotion: {
    variantA: boolean
    variantB: boolean
  }
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ABTestingPage() {
  const [loading, setLoading] = useState(true)
  const [comparison, setComparison] = useState<ABTestComparison | null>(null)
  const [daysBack, setDaysBack] = useState(30)
  const [promoting, setPromoting] = useState<string | null>(null)

  // Charger comparaison au mount
  useEffect(() => {
    loadComparison()
  }, [])

  // Charger comparaison
  const loadComparison = async () => {
    setLoading(true)
    try {
      const response = await fetch(
        `/api/admin/ab-testing/compare?daysBack=${daysBack}`
      )

      if (!response.ok) {
        throw new Error('Erreur chargement comparaison')
      }

      const data = await response.json()
      setComparison(data)
    } catch (error) {
      console.error('[A/B Testing] Erreur:', error)
      alert('Erreur lors du chargement de la comparaison')
    } finally {
      setLoading(false)
    }
  }

  // Promouvoir variant
  const handlePromote = async (variant: 'variant_a' | 'variant_b') => {
    if (
      !confirm(
        `Promouvoir ${variant === 'variant_a' ? 'Variant A (IRAC Détaillé)' : 'Variant B (Socratique)'} en Control ?\n\nTous les futurs utilisateurs recevront ce prompt.`
      )
    ) {
      return
    }

    setPromoting(variant)

    try {
      const response = await fetch('/api/admin/ab-testing/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant }),
      })

      if (!response.ok) {
        throw new Error('Erreur promotion')
      }

      alert(
        `${variant === 'variant_a' ? 'Variant A' : 'Variant B'} promu avec succès !\n\nLe nouveau prompt est maintenant actif pour tous les utilisateurs.`
      )

      // Recharger
      await loadComparison()
    } catch (error) {
      console.error('[A/B Testing] Erreur promotion:', error)
      alert('Erreur lors de la promotion du variant')
    } finally {
      setPromoting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-muted-foreground dark:text-gray-400">
            Chargement comparaison A/B...
          </p>
        </div>
      </div>
    )
  }

  if (!comparison) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600" />
          <p className="text-muted-foreground dark:text-gray-400">
            Erreur chargement comparaison
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              A/B Testing Prompts
              <BarChart3 className="ml-2 inline-block h-8 w-8 text-blue-600" />
            </h1>
            <p className="mt-2 text-muted-foreground dark:text-gray-400">
              Optimisation prompts juridiques via tests A/B scientifiques
            </p>
          </div>

          <div className="flex gap-3">
            <select
              value={daysBack}
              onChange={e => {
                setDaysBack(parseInt(e.target.value))
                setTimeout(loadComparison, 100)
              }}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <option value="7">7 jours</option>
              <option value="14">14 jours</option>
              <option value="30">30 jours</option>
              <option value="60">60 jours</option>
            </select>

            <button
              onClick={loadComparison}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </div>
      </div>

      {/* Recommandations */}
      {comparison.recommendations.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-300">
            <Award className="h-5 w-5" />
            Recommandations Statistiques
          </h3>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
            {comparison.recommendations.map((rec, index) => (
              <li key={index}>• {rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Cartes Variants */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <VariantCard
          title="Control - IRAC Standard"
          subtitle="Baseline (50% users)"
          metrics={comparison.control}
          significance={null}
          isControl={true}
          onPromote={null}
          promoting={false}
        />

        <VariantCard
          title="Variant A - IRAC Détaillé"
          subtitle="Précision maximale (25% users)"
          metrics={comparison.variantA}
          significance={comparison.statisticalSignificance.variantA}
          isControl={false}
          eligible={comparison.eligibleForPromotion.variantA}
          onPromote={() => handlePromote('variant_a')}
          promoting={promoting === 'variant_a'}
        />

        <VariantCard
          title="Variant B - Socratique"
          subtitle="Pédagogique (25% users)"
          metrics={comparison.variantB}
          significance={comparison.statisticalSignificance.variantB}
          isControl={false}
          eligible={comparison.eligibleForPromotion.variantB}
          onPromote={() => handlePromote('variant_b')}
          promoting={promoting === 'variant_b'}
        />
      </div>

      {/* Graphiques Comparatifs */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ComparisonChart
          title="Taux Satisfaction (Rating ≥4)"
          control={comparison.control.satisfactionRate}
          variantA={comparison.variantA.satisfactionRate}
          variantB={comparison.variantB.satisfactionRate}
          suffix="%"
          higherIsBetter={true}
        />

        <ComparisonChart
          title="Rating Moyen"
          control={comparison.control.avgRating}
          variantA={comparison.variantA.avgRating}
          variantB={comparison.variantB.avgRating}
          suffix="/5"
          higherIsBetter={true}
          max={5}
        />

        <ComparisonChart
          title="Précision Citations"
          control={comparison.control.citationAccuracyRate}
          variantA={comparison.variantA.citationAccuracyRate}
          variantB={comparison.variantB.citationAccuracyRate}
          suffix="%"
          higherIsBetter={true}
        />

        <ComparisonChart
          title="Taux Hallucinations"
          control={comparison.control.hallucinationRate}
          variantA={comparison.variantA.hallucinationRate}
          variantB={comparison.variantB.hallucinationRate}
          suffix="%"
          higherIsBetter={false}
        />

        <ComparisonChart
          title="Temps Réponse Moyen"
          control={comparison.control.avgResponseTime}
          variantA={comparison.variantA.avgResponseTime}
          variantB={comparison.variantB.avgResponseTime}
          suffix="ms"
          higherIsBetter={false}
        />
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANTS AUXILIAIRES
// =============================================================================

function VariantCard({
  title,
  subtitle,
  metrics,
  significance,
  isControl,
  eligible,
  onPromote,
  promoting,
}: {
  title: string
  subtitle: string
  metrics: VariantMetrics
  significance: StatisticalSignificance | null
  isControl: boolean
  eligible?: boolean
  onPromote: (() => void) | null
  promoting: boolean
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        isControl
          ? 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
          : eligible
            ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
            : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800'
      }`}
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground dark:text-gray-400">{subtitle}</p>
      </div>

      {/* Métriques */}
      <div className="mb-4 space-y-2 text-sm">
        <MetricRow
          icon={<Users className="h-4 w-4" />}
          label="Feedbacks"
          value={metrics.totalFeedbacks}
        />
        <MetricRow
          icon={<TrendingUp className="h-4 w-4 text-green-600" />}
          label="Satisfaction"
          value={`${metrics.satisfactionRate.toFixed(1)}%`}
        />
        <MetricRow
          icon={<CheckCircle className="h-4 w-4 text-blue-600" />}
          label="Rating Moyen"
          value={`${metrics.avgRating.toFixed(2)}/5`}
        />
        <MetricRow
          icon={<AlertTriangle className="h-4 w-4 text-yellow-600" />}
          label="Hallucinations"
          value={`${metrics.hallucinationRate.toFixed(1)}%`}
        />
        <MetricRow
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          label="Latence"
          value={`${metrics.avgResponseTime.toFixed(0)}ms`}
        />
      </div>

      {/* Significativité */}
      {!isControl && significance && (
        <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="mb-1 text-xs font-medium text-muted-foreground dark:text-gray-400">
            Test Statistique
          </p>
          <p className="text-sm">
            {significance.improvement >= 0 ? '+' : ''}
            {significance.improvement.toFixed(1)}% satisfaction
          </p>
          <p className="text-xs text-muted-foreground dark:text-gray-400">
            p-value: {significance.pValue.toFixed(4)}
            {significance.significant ? ' ✅ Significatif' : ' ⚠️ Non significatif'}
          </p>
        </div>
      )}

      {/* Bouton Promotion */}
      {eligible && onPromote && (
        <button
          onClick={onPromote}
          disabled={promoting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {promoting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Promotion...
            </>
          ) : (
            <>
              <Award className="h-4 w-4" />
              Promouvoir en Control
            </>
          )}
        </button>
      )}
    </div>
  )
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-gray-700 dark:text-gray-300">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function ComparisonChart({
  title,
  control,
  variantA,
  variantB,
  suffix,
  higherIsBetter,
  max,
}: {
  title: string
  control: number
  variantA: number
  variantB: number
  suffix: string
  higherIsBetter: boolean
  max?: number
}) {
  const maxValue = max || Math.max(control, variantA, variantB) * 1.1

  const getBarColor = (value: number) => {
    if (!higherIsBetter) {
      // Latence, hallucinations : plus bas = meilleur
      return value <= control ? 'bg-green-500' : 'bg-red-500'
    } else {
      // Satisfaction, rating : plus haut = meilleur
      return value >= control ? 'bg-green-500' : 'bg-red-500'
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 font-semibold">{title}</h3>

      <div className="space-y-4">
        {/* Control */}
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Control</span>
            <span className="font-semibold">
              {control.toFixed(1)}
              {suffix}
            </span>
          </div>
          <div className="h-6 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${(control / maxValue) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Variant A */}
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Variant A</span>
            <span className="font-semibold">
              {variantA.toFixed(1)}
              {suffix}
              <span className="ml-2 text-xs text-muted-foreground dark:text-gray-400">
                ({variantA >= control ? '+' : ''}
                {((variantA - control) / control * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="h-6 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full rounded-full transition-all ${getBarColor(variantA)}`}
              style={{ width: `${(variantA / maxValue) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Variant B */}
        <div>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-medium">Variant B</span>
            <span className="font-semibold">
              {variantB.toFixed(1)}
              {suffix}
              <span className="ml-2 text-xs text-muted-foreground dark:text-gray-400">
                ({variantB >= control ? '+' : ''}
                {((variantB - control) / control * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="h-6 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-full rounded-full transition-all ${getBarColor(variantB)}`}
              style={{ width: `${(variantB / maxValue) * 100}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  )
}
