'use client'

import { useTranslations } from 'next-intl'
import type { StructuredDossier } from '@/lib/ai/dossier-structuring-service'

interface ConfidenceBreakdownProps {
  result: StructuredDossier
}

export default function ConfidenceBreakdown({ result }: ConfidenceBreakdownProps) {
  const t = useTranslations('assistant')

  // Calculer le score de confiance global basé sur plusieurs dimensions
  const confidence = result.confidence || 0

  // Calculer les dimensions de confiance
  const dimensions = {
    // Qualité des sources (basée sur la confiance générale)
    sourcesQuality: Math.round(confidence),

    // Complétude des données (% de champs importants remplis)
    dataCompleteness: calculateDataCompleteness(result),

    // Force des références (nombre et pertinence)
    referencesStrength: calculateReferencesStrength(result),
  }

  // Score global est la moyenne des 3 dimensions
  const globalScore = Math.round(
    (dimensions.sourcesQuality + dimensions.dataCompleteness + dimensions.referencesStrength) / 3
  )

  return (
    <div className="rounded-lg border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xl">📊</span>
        <h3 className="text-lg font-semibold text-indigo-900 dark:text-indigo-200">
          Confiance de l'Analyse
        </h3>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Gauge circulaire */}
        <div className="flex flex-col items-center justify-center">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full transform -rotate-90">
              {/* Cercle de fond */}
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                className="text-indigo-200 dark:text-indigo-800"
              />
              {/* Cercle de progression */}
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="currentColor"
                strokeWidth="12"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 70}`}
                strokeDashoffset={`${2 * Math.PI * 70 * (1 - globalScore / 100)}`}
                className={`transition-all duration-1000 ${
                  globalScore >= 80
                    ? 'text-green-500'
                    : globalScore >= 60
                    ? 'text-blue-500'
                    : globalScore >= 40
                    ? 'text-yellow-500'
                    : 'text-red-500'
                }`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-indigo-900 dark:text-indigo-200">
                {globalScore}%
              </span>
              <span className="text-xs text-indigo-600 dark:text-indigo-400">
                Confiance
              </span>
            </div>
          </div>
          <p className="mt-4 text-sm text-center text-indigo-700 dark:text-indigo-300">
            {globalScore >= 80
              ? 'Analyse très fiable'
              : globalScore >= 60
              ? 'Analyse fiable'
              : globalScore >= 40
              ? 'Analyse à vérifier'
              : 'Analyse à approfondir'}
          </p>
        </div>

        {/* Breakdown par dimensions */}
        <div className="space-y-4">
          {/* Qualité des sources */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                Qualité des sources
              </span>
              <span className="text-sm text-indigo-700 dark:text-indigo-300">
                {dimensions.sourcesQuality}%
              </span>
            </div>
            <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  dimensions.sourcesQuality >= 80
                    ? 'bg-green-500'
                    : dimensions.sourcesQuality >= 60
                    ? 'bg-blue-500'
                    : 'bg-yellow-500'
                }`}
                style={{ width: `${dimensions.sourcesQuality}%` }}
              />
            </div>
          </div>

          {/* Complétude des données */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                Complétude des données
              </span>
              <span className="text-sm text-indigo-700 dark:text-indigo-300">
                {dimensions.dataCompleteness}%
              </span>
            </div>
            <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  dimensions.dataCompleteness >= 80
                    ? 'bg-green-500'
                    : dimensions.dataCompleteness >= 60
                    ? 'bg-blue-500'
                    : 'bg-yellow-500'
                }`}
                style={{ width: `${dimensions.dataCompleteness}%` }}
              />
            </div>
          </div>

          {/* Force des références */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-indigo-900 dark:text-indigo-200">
                Force des références
              </span>
              <span className="text-sm text-indigo-700 dark:text-indigo-300">
                {dimensions.referencesStrength}%
              </span>
            </div>
            <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  dimensions.referencesStrength >= 80
                    ? 'bg-green-500'
                    : dimensions.referencesStrength >= 60
                    ? 'bg-blue-500'
                    : 'bg-yellow-500'
                }`}
                style={{ width: `${dimensions.referencesStrength}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Légende */}
      <div className="mt-6 pt-4 border-t border-indigo-200 dark:border-indigo-800">
        <div className="grid grid-cols-2 gap-2 text-xs text-indigo-700 dark:text-indigo-300">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span>Excellent (≥ 80%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span>Bon (60-79%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span>Moyen (40-59%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span>Faible (&lt; 40%)</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Fonction pour calculer la complétude des données
function calculateDataCompleteness(result: StructuredDossier): number {
  const requiredFields = [
    result.client.nom,
    result.client.prenom,
    result.partieAdverse?.nom,
    result.typeProcedure,
    result.titrePropose,
    result.resumeCourt,
  ]

  const optionalFields = [
    result.client.adresse,
    result.client.profession,
    result.partieAdverse?.adresse,
    result.donneesSpecifiques?.tribunal,
    result.faitsExtraits?.length > 0 ? 'has_facts' : null,
    result.actionsSuggerees?.length > 0 ? 'has_actions' : null,
  ]

  const requiredFilled = requiredFields.filter(Boolean).length
  const optionalFilled = optionalFields.filter(Boolean).length

  // 70% poids pour champs obligatoires, 30% pour optionnels
  const score =
    (requiredFilled / requiredFields.length) * 70 +
    (optionalFilled / optionalFields.length) * 30

  return Math.round(score)
}

// Fonction pour calculer la force des références
function calculateReferencesStrength(result: StructuredDossier): number {
  if (!result.references || result.references.length === 0) {
    return 0
  }

  // Nombre de références (max 10 pour 50 points)
  const countScore = Math.min(result.references.length / 10, 1) * 50

  // Pertinence moyenne (max 50 points)
  const avgPertinence =
    result.references.reduce((sum, ref) => sum + (ref.pertinence || 0), 0) /
    result.references.length
  const pertinenceScore = avgPertinence * 0.5

  return Math.round(countScore + pertinenceScore)
}
