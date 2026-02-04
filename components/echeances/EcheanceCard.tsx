'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteEcheanceAction, marquerEcheanceRespecte } from '@/app/actions/echeances'
import { joursRestants, niveauUrgence, formatterDelai } from '@/lib/utils/delais-tunisie'

interface EcheanceCardProps {
  echeance: any
  showDossierInfo?: boolean
}

const urgenceColors = {
  depasse: 'bg-red-100 text-red-700 border-red-300',
  critique: 'bg-orange-100 text-orange-700 border-orange-300',
  urgent: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  proche: 'bg-blue-100 text-blue-700 border-blue-300',
  normal: 'bg-gray-100 text-gray-700 border-gray-300',
}

const typeColors: Record<string, string> = {
  audience: 'bg-purple-100 text-purple-700',
  delai_legal: 'bg-red-100 text-red-700',
  delai_interne: 'bg-blue-100 text-blue-700',
  autre: 'bg-gray-100 text-gray-700',
}

const typeLabels: Record<string, string> = {
  audience: 'Audience',
  delai_legal: 'Délai légal',
  delai_interne: 'Délai interne',
  autre: 'Autre',
}

export default function EcheanceCard({ echeance, showDossierInfo = false }: EcheanceCardProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showActions, setShowActions] = useState(false)

  const dateEcheance = new Date(echeance.date_echeance)
  const jours = joursRestants(dateEcheance)
  const urgence = niveauUrgence(dateEcheance)

  const handleDelete = async () => {
    if (!confirm('Supprimer cette échéance ?')) return

    setLoading(true)
    const result = await deleteEcheanceAction(echeance.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const handleMarquerRespecte = async () => {
    setLoading(true)
    const result = await marquerEcheanceRespecte(echeance.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const getDossierName = () => {
    if (!echeance.dossiers) return ''
    const client = echeance.dossiers.clients
    if (!client) return echeance.dossiers.numero_dossier

    const clientName =
      client.type === 'PERSONNE_PHYSIQUE'
        ? `${client.nom} ${client.prenom || ''}`.trim()
        : client.denomination

    return `${echeance.dossiers.numero_dossier} - ${clientName}`
  }

  return (
    <div
      className={`rounded-lg border-2 bg-white p-4 shadow-sm hover:shadow-md transition-shadow ${urgenceColors[urgence]}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                typeColors[echeance.type_echeance]
              }`}
            >
              {typeLabels[echeance.type_echeance]}
            </span>

            {echeance.statut === 'respecte' && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                ✓ Respectée
              </span>
            )}

            {urgence === 'depasse' && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                ⚠️ Dépassée
              </span>
            )}

            {urgence === 'critique' && jours >= 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-700">
                🔥 Critique
              </span>
            )}
          </div>

          <h3 className="text-lg font-semibold text-gray-900">{echeance.titre}</h3>

          {echeance.description && (
            <p className="mt-1 text-sm text-gray-600">{echeance.description}</p>
          )}

          {showDossierInfo && echeance.dossiers && (
            <p className="mt-2 text-sm text-gray-500">
              📁 {getDossierName()}
            </p>
          )}

          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-gray-700">
                {dateEcheance.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <svg
                className="h-4 w-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span
                className={`font-medium ${
                  jours < 0
                    ? 'text-red-700'
                    : jours <= 3
                    ? 'text-orange-700'
                    : jours <= 7
                    ? 'text-yellow-700'
                    : 'text-gray-700'
                }`}
              >
                {formatterDelai(jours)}
              </span>
            </div>
          </div>

          {/* Informations de calcul */}
          {echeance.delai_type && echeance.date_point_depart && (
            <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
              <p>
                📊 Calculé : {echeance.nombre_jours} jour(s){' '}
                {echeance.delai_type === 'jours_ouvrables'
                  ? 'ouvrables'
                  : echeance.delai_type === 'jours_francs'
                  ? 'francs'
                  : 'calendaires'}{' '}
                depuis le{' '}
                {new Date(echeance.date_point_depart).toLocaleDateString('fr-FR')}
              </p>
            </div>
          )}

          {/* Rappels */}
          {echeance.statut === 'actif' && (
            <div className="mt-2 flex gap-1">
              {echeance.rappel_j15 && (
                <span className="text-xs text-gray-500">🔔 J-15</span>
              )}
              {echeance.rappel_j7 && (
                <span className="text-xs text-gray-500">🔔 J-7</span>
              )}
              {echeance.rappel_j3 && (
                <span className="text-xs text-gray-500">🔔 J-3</span>
              )}
              {echeance.rappel_j1 && (
                <span className="text-xs text-gray-500">🔔 J-1</span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowActions(!showActions)}
          disabled={loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {showActions ? 'Fermer' : 'Actions'}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {showActions && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          {echeance.statut === 'actif' && (
            <button
              onClick={handleMarquerRespecte}
              disabled={loading}
              className="w-full rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              ✓ Marquer comme respectée
            </button>
          )}

          <button
            onClick={() => router.push(`/echeances/${echeance.id}/edit`)}
            disabled={loading}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            ✏️ Modifier
          </button>

          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            🗑️ Supprimer
          </button>
        </div>
      )}
    </div>
  )
}
