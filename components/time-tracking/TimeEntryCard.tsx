'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteTimeEntryAction } from '@/app/actions/time-entries'
import type { TimeEntry } from '@/types/time-tracking'

interface TimeEntryCardProps {
  entry: TimeEntry
  showDossierInfo?: boolean
}

export default function TimeEntryCard({ entry, showDossierInfo = false }: TimeEntryCardProps) {
  const router = useRouter()
  const t = useTranslations('timeTracking')
  const tConfirm = useTranslations('confirmations')
  const tCards = useTranslations('cards')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showActions, setShowActions] = useState(false)

  const handleDelete = async () => {
    if (!confirm(tConfirm('deleteTimeEntry'))) return

    setLoading(true)
    const result = await deleteTimeEntryAction(entry.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60

    if (hours === 0) return `${mins}min`
    if (mins === 0) return `${hours}h`
    return `${hours}h${mins}min`
  }

  const isFacturee = !!entry.facture_id

  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-500">
              {new Date(entry.date).toLocaleDateString('fr-FR', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>

            {entry.heure_debut && (
              <span className="text-xs text-gray-400">
                {entry.heure_debut}
                {entry.heure_fin && ` - ${entry.heure_fin}`}
              </span>
            )}

            {!entry.facturable && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                {t('notBillable')}
              </span>
            )}

            {isFacturee && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                {t('billed')}
              </span>
            )}
          </div>

          <h3 className="font-medium text-gray-900">{entry.description}</h3>

          {showDossierInfo && entry.dossiers && (
            <p className="mt-1 text-sm text-gray-500">
              📁 {entry.dossiers.numero_dossier}
            </p>
          )}

          {entry.notes && (
            <p className="mt-1 text-sm text-gray-600">{entry.notes}</p>
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="font-semibold text-gray-900">
                {formatDuration(entry.duree_minutes)}
              </span>
            </div>

            {entry.taux_horaire && entry.taux_horaire > 0 && (
              <>
                <div className="text-gray-400">•</div>
                <div className="text-gray-600">
                  {entry.taux_horaire.toFixed(0)} TND/h
                </div>
                <div className="text-gray-400">•</div>
                <div className="font-semibold text-blue-600">
                  {parseFloat(entry.montant_calcule || '0').toFixed(3)} TND
                </div>
              </>
            )}
          </div>
        </div>

        {!isFacturee && (
          <button
            onClick={() => setShowActions(!showActions)}
            disabled={loading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {showActions ? 'Fermer' : 'Actions'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {showActions && !isFacturee && (
        <div className="mt-3 space-y-2 rounded-md bg-gray-50 p-3">
          <button
            onClick={() => router.push(`/time-tracking/${entry.id}/edit`)}
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
