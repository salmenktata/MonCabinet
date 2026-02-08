'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface RAGInsightsProps {
  ragMetrics?: StructuredDossier['ragMetrics']
}

export default function RAGInsights({ ragMetrics }: RAGInsightsProps) {
  const t = useTranslations('assistant')
  const [isOpen, setIsOpen] = useState(false)

  if (!ragMetrics) return null

  const { totalFound, aboveThreshold, scoreRange, sourceDistribution, searchTimeMs, provider, cacheHit } = ragMetrics

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-900/20 dark:to-slate-900/20">
      {/* Header collapsible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors rounded-t-lg"
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">📊</span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200">
            Métriques de Recherche RAG
          </h3>
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded-full">
            {totalFound} sources
          </span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Contenu */}
      {isOpen && (
        <div className="px-6 pb-6 space-y-4">
          {/* Ligne 1 : Stats principales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Sources trouvées */}
            <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Sources trouvées</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalFound}</div>
            </div>

            {/* Au-dessus du seuil */}
            <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Pertinentes (≥60%)</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{aboveThreshold}</div>
              <div className="text-xs text-gray-500 mt-1">
                {totalFound > 0 ? Math.round((aboveThreshold / totalFound) * 100) : 0}% du total
              </div>
            </div>

            {/* Temps de recherche */}
            <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Temps de recherche</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {searchTimeMs}ms
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {searchTimeMs < 100 ? '⚡ Très rapide' : searchTimeMs < 500 ? '✓ Rapide' : '⏱ Normal'}
              </div>
            </div>

            {/* Provider */}
            <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Provider</div>
              <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {provider || 'N/A'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {cacheHit ? '✓ Cache hit' : '○ Cache miss'}
              </div>
            </div>
          </div>

          {/* Ligne 2 : Scores */}
          <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Distribution des scores de pertinence
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Minimum</div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">
                  {(scoreRange.min * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Moyenne</div>
                <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                  {(scoreRange.avg * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Maximum</div>
                <div className="text-xl font-bold text-green-600 dark:text-green-400">
                  {(scoreRange.max * 100).toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Barre de progression visuelle */}
            <div className="mt-4 relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-gradient-to-r from-red-500 via-blue-500 to-green-500 rounded-full"
                style={{
                  left: `${scoreRange.min * 100}%`,
                  width: `${(scoreRange.max - scoreRange.min) * 100}%`,
                }}
              />
            </div>
          </div>

          {/* Ligne 3 : Distribution par type de source */}
          {Object.keys(sourceDistribution).length > 0 && (
            <div className="rounded-lg bg-white dark:bg-gray-800/50 p-4 border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Distribution par type de source
              </h4>
              <div className="space-y-2">
                {Object.entries(sourceDistribution).map(([type, count]) => {
                  const percentage = (count / totalFound) * 100
                  const typeConfig = {
                    code: { label: 'Codes et Lois', color: 'bg-blue-500', icon: '📖' },
                    jurisprudence: { label: 'Jurisprudence', color: 'bg-amber-500', icon: '⚖️' },
                    doctrine: { label: 'Doctrine', color: 'bg-purple-500', icon: '📚' },
                  }[type] || { label: type, color: 'bg-gray-500', icon: '📄' }

                  return (
                    <div key={type} className="flex items-center gap-3">
                      <span className="text-lg">{typeConfig.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {typeConfig.label}
                          </span>
                          <span className="text-xs text-gray-500">
                            {count} ({percentage.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${typeConfig.color} rounded-full transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Note explicative */}
          <div className="text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <span className="font-medium">💡 Info :</span> Ces métriques montrent comment les sources juridiques ont été trouvées et évaluées pour enrichir cette analyse. Un score de pertinence élevé (≥ 80%) indique une correspondance forte avec votre dossier.
          </div>
        </div>
      )}
    </div>
  )
}
