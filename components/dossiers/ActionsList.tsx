'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  toggleActionStatutAction,
  deleteActionDossierAction,
} from '@/app/actions/actions-dossier'

interface ActionsListProps {
  actions: any[]
  dossierId: string
}

const prioriteColors: Record<string, string> = {
  BASSE: 'bg-gray-100 text-gray-700',
  NORMALE: 'bg-blue-100 text-blue-700',
  HAUTE: 'bg-orange-100 text-orange-700',
  URGENTE: 'bg-red-100 text-red-700',
}

const typeIcons: Record<string, string> = {
  AUDIENCE: '⚖️',
  DEADLINE: '⏰',
  RDV_CLIENT: '👤',
  REDACTION: '📝',
  AUTRE: '📋',
}

export default function ActionsList({ actions, dossierId }: ActionsListProps) {
  const router = useRouter()
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const handleToggle = async (actionId: string) => {
    setLoadingAction(actionId)
    await toggleActionStatutAction(actionId, dossierId)
    setLoadingAction(null)
    router.refresh()
  }

  const handleDelete = async (actionId: string) => {
    if (!confirm('Supprimer cette action ?')) return

    setLoadingAction(actionId)
    await deleteActionDossierAction(actionId, dossierId)
    setLoadingAction(null)
    router.refresh()
  }

  const sortedActions = [...actions].sort((a, b) => {
    // Terminées en dernier
    if (a.statut === 'TERMINEE' && b.statut !== 'TERMINEE') return 1
    if (a.statut !== 'TERMINEE' && b.statut === 'TERMINEE') return -1

    // Par priorité
    const priorityOrder: Record<string, number> = {
      URGENTE: 0,
      HAUTE: 1,
      NORMALE: 2,
      BASSE: 3,
    }
    return priorityOrder[a.priorite] - priorityOrder[b.priorite]
  })

  return (
    <div className="space-y-3">
      {sortedActions.map((action) => (
        <div
          key={action.id}
          className={`rounded-lg border p-4 transition-all ${
            action.statut === 'TERMINEE'
              ? 'bg-gray-50 border-gray-200 opacity-60'
              : 'bg-white border-gray-300 hover:border-blue-300 hover:shadow-sm'
          }`}
        >
          <div className="flex items-start gap-3">
            <button
              onClick={() => handleToggle(action.id)}
              disabled={loadingAction === action.id}
              className="mt-0.5 flex-shrink-0"
            >
              <div
                className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                  action.statut === 'TERMINEE'
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300 hover:border-blue-500'
                }`}
              >
                {action.statut === 'TERMINEE' && (
                  <svg
                    className="h-3 w-3 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeIcons[action.type] || '📋'}</span>
                    <h4
                      className={`font-medium ${
                        action.statut === 'TERMINEE'
                          ? 'line-through text-gray-500'
                          : 'text-gray-900'
                      }`}
                    >
                      {action.titre}
                    </h4>
                  </div>

                  {action.description && (
                    <p className="mt-1 text-sm text-gray-600">
                      {action.description}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        prioriteColors[action.priorite]
                      }`}
                    >
                      {action.priorite}
                    </span>

                    {action.date_limite && (
                      <span className="text-xs text-gray-500">
                        📅 {new Date(action.date_limite).toLocaleDateString('fr-FR')}
                      </span>
                    )}

                    <span
                      className={`text-xs ${
                        action.statut === 'TERMINEE'
                          ? 'text-green-600'
                          : action.statut === 'EN_COURS'
                          ? 'text-blue-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {action.statut.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(action.id)}
                  disabled={loadingAction === action.id}
                  className="text-gray-400 hover:text-red-600 p-1"
                  title="Supprimer"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}

      {actions.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">Aucune action pour ce dossier</p>
        </div>
      )}
    </div>
  )
}
