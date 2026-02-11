/**
 * Page Dashboard - Active Learning (Phase 5.2)
 *
 * Interface admin pour identifier et acquérir documents manquants :
 * - Liste gaps KB priorisés (top 50)
 * - Détails : sujet, fréquence, rating moyen, sources suggérées
 * - Bouton "Acquire" pour lancer crawl automatique
 * - Filtres : domaine, période, min fréquence
 *
 * @module app/super-admin/active-learning/page
 */

'use client'

import { useState, useEffect } from 'react'
import {
  TrendingDown,
  AlertTriangle,
  Target,
  Download,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface KnowledgeGap {
  id: string
  topic: string
  occurrenceCount: number
  avgRating: number
  avgConfidence: number
  avgSourcesCount: number
  exampleQuestions: string[]
  suggestedSources: string[]
  priorityScore: number
  detectedAt: string
}

interface GapStats {
  totalGapsFound: number
  totalQuestionsAnalyzed: number
  avgPriorityScore: number
  topDomains: { domain: string; count: number }[]
}

interface GapAnalysisResult {
  gaps: KnowledgeGap[]
  stats: GapStats
  recommendations: string[]
}

interface FilterOptions {
  daysBack: number
  minOccurrences: number
  maxRating: number
  domains: string[]
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export default function ActiveLearningPage() {
  const [loading, setLoading] = useState(true)
  const [analysisResult, setAnalysisResult] =
    useState<GapAnalysisResult | null>(null)
  const [expandedGapId, setExpandedGapId] = useState<string | null>(null)
  const [filters, setFilters] = useState<FilterOptions>({
    daysBack: 30,
    minOccurrences: 3,
    maxRating: 3,
    domains: [],
  })
  const [showFilters, setShowFilters] = useState(false)

  // Charger analyse au mount
  useEffect(() => {
    loadAnalysis()
  }, [])

  // Charger analyse
  const loadAnalysis = async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        daysBack: filters.daysBack.toString(),
        minOccurrences: filters.minOccurrences.toString(),
        maxRating: filters.maxRating.toString(),
      })

      if (filters.domains.length > 0) {
        queryParams.append('domains', filters.domains.join(','))
      }

      const response = await fetch(
        `/api/admin/active-learning/analyze?${queryParams}`
      )

      if (!response.ok) {
        throw new Error('Erreur chargement analyse')
      }

      const data = await response.json()
      setAnalysisResult(data)
    } catch (error) {
      console.error('[Active Learning] Erreur:', error)
      alert('Erreur lors du chargement de l\'analyse')
    } finally {
      setLoading(false)
    }
  }

  // Lancer acquisition automatique
  const handleAcquire = async (gap: KnowledgeGap) => {
    if (
      !confirm(
        `Lancer l'acquisition automatique pour "${gap.topic}" ?\n\nCeci va créer une source web et démarrer le crawl.`
      )
    ) {
      return
    }

    try {
      const response = await fetch('/api/admin/active-learning/acquire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gapId: gap.id, topic: gap.topic }),
      })

      if (!response.ok) {
        throw new Error('Erreur acquisition')
      }

      alert(
        `Acquisition lancée pour "${gap.topic}" !\n\nLe crawl démarrera automatiquement dans les prochaines minutes.`
      )
    } catch (error) {
      console.error('[Active Learning] Erreur acquisition:', error)
      alert('Erreur lors du lancement de l\'acquisition')
    }
  }

  // Toggle expansion gap
  const toggleGap = (gapId: string) => {
    setExpandedGapId(expandedGapId === gapId ? null : gapId)
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">
            Analyse des gaps KB en cours...
          </p>
        </div>
      </div>
    )
  }

  if (!analysisResult) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-600" />
          <p className="text-gray-600 dark:text-gray-400">
            Erreur chargement analyse
          </p>
        </div>
      </div>
    )
  }

  const { gaps, stats, recommendations } = analysisResult

  return (
    <div className="min-h-screen bg-gray-50 p-6 dark:bg-gray-900">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Active Learning
              <Sparkles className="ml-2 inline-block h-8 w-8 text-yellow-500" />
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Identification automatique des gaps KB via feedback avocats
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              <Filter className="h-5 w-5" />
              Filtres
              {showFilters ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            <button
              onClick={loadAnalysis}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Filtres */}
        {showFilters && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Période (jours)
                </label>
                <input
                  type="number"
                  value={filters.daysBack}
                  onChange={e =>
                    setFilters({ ...filters, daysBack: parseInt(e.target.value) })
                  }
                  min="1"
                  max="365"
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Min Occurrences
                </label>
                <input
                  type="number"
                  value={filters.minOccurrences}
                  onChange={e =>
                    setFilters({
                      ...filters,
                      minOccurrences: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  max="20"
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Max Rating
                </label>
                <input
                  type="number"
                  value={filters.maxRating}
                  onChange={e =>
                    setFilters({ ...filters, maxRating: parseInt(e.target.value) })
                  }
                  min="1"
                  max="5"
                  className="w-full rounded-lg border border-gray-300 p-2 dark:border-gray-600 dark:bg-gray-700"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={loadAnalysis}
                  className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Appliquer Filtres
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Stats globales */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard
          title="Gaps Identifiés"
          value={stats.totalGapsFound}
          icon={<TrendingDown className="h-6 w-6 text-red-600" />}
          bgColor="bg-red-50 dark:bg-red-900/20"
        />
        <StatCard
          title="Questions Analysées"
          value={stats.totalQuestionsAnalyzed}
          icon={<Target className="h-6 w-6 text-blue-600" />}
          bgColor="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          title="Priorité Moyenne"
          value={`${stats.avgPriorityScore.toFixed(1)}/100`}
          icon={<AlertTriangle className="h-6 w-6 text-yellow-600" />}
          bgColor="bg-yellow-50 dark:bg-yellow-900/20"
        />
        <StatCard
          title="Domaines Critiques"
          value={stats.topDomains.length}
          icon={<Download className="h-6 w-6 text-green-600" />}
          bgColor="bg-green-50 dark:bg-green-900/20"
        />
      </div>

      {/* Recommandations */}
      {recommendations.length > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-300">
            <Sparkles className="h-5 w-5" />
            Recommandations IA
          </h3>
          <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
            {recommendations.map((rec, index) => (
              <li key={index}>• {rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Liste gaps */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">
          Gaps KB Priorisés ({gaps.length})
        </h2>

        {gaps.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              🎉 Aucun gap critique identifié !
            </p>
          </div>
        ) : (
          gaps.map(gap => (
            <GapCard
              key={gap.id}
              gap={gap}
              expanded={expandedGapId === gap.id}
              onToggle={() => toggleGap(gap.id)}
              onAcquire={() => handleAcquire(gap)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// =============================================================================
// COMPOSANTS AUXILIAIRES
// =============================================================================

function StatCard({
  title,
  value,
  icon,
  bgColor,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  bgColor: string
}) {
  return (
    <div className={`rounded-lg border border-gray-200 p-4 dark:border-gray-700 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        {icon}
      </div>
    </div>
  )
}

function GapCard({
  gap,
  expanded,
  onToggle,
  onAcquire,
}: {
  gap: KnowledgeGap
  expanded: boolean
  onToggle: () => void
  onAcquire: () => void
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
        onClick={onToggle}
      >
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">{gap.topic}</h3>
            <PriorityBadge score={gap.priorityScore} />
          </div>

          <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <span>🔄 {gap.occurrenceCount} questions</span>
            <span>⭐ {gap.avgRating.toFixed(1)}/5 rating</span>
            <span>📊 {(gap.avgConfidence * 100).toFixed(0)}% confidence</span>
            <span>📚 {gap.avgSourcesCount.toFixed(0)} sources moy</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={e => {
              e.stopPropagation()
              onAcquire()
            }}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <Download className="mr-1 inline-block h-4 w-4" />
            Acquérir
          </button>

          {expanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </div>
      </div>

      {/* Contenu étendu */}
      {expanded && (
        <div className="border-t border-gray-200 p-4 dark:border-gray-700">
          {/* Questions exemplaires */}
          <div className="mb-4">
            <h4 className="mb-2 font-semibold">
              Questions Exemplaires ({gap.exampleQuestions.length})
            </h4>
            <ul className="space-y-1 text-sm">
              {gap.exampleQuestions.slice(0, 5).map((q, index) => (
                <li key={index} className="text-gray-700 dark:text-gray-300">
                  {index + 1}. {q.substring(0, 150)}
                  {q.length > 150 ? '...' : ''}
                </li>
              ))}
            </ul>
          </div>

          {/* Sources suggérées */}
          {gap.suggestedSources.length > 0 && (
            <div>
              <h4 className="mb-2 font-semibold">
                Sources Suggérées par Avocats ({gap.suggestedSources.length})
              </h4>
              <ul className="space-y-1 text-sm">
                {gap.suggestedSources.map((source, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <ExternalLink className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                    <span>{source}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PriorityBadge({ score }: { score: number }) {
  let color = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
  let label = 'Faible'

  if (score >= 70) {
    color = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    label = 'Critique'
  } else if (score >= 50) {
    color = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    label = 'Élevée'
  } else if (score >= 30) {
    color = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
    label = 'Moyenne'
  }

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>
      {label} ({score}/100)
    </span>
  )
}
