'use client'

import { useState } from 'react'
import { getWorkflowById, calculerProgression } from '@/lib/workflows/workflows-config'
import WorkflowTransitionModal, { type TransitionType } from './WorkflowTransitionModal'
import type { WorkflowHistoryEntry } from '@/app/actions/dossiers'

interface WorkflowVisualizerProps {
  workflowId: string
  etapeActuelleId: string
  onEtapeChange?: (etapeId: string, note?: string) => void | Promise<void>
  workflowHistory?: WorkflowHistoryEntry[]
}

export default function WorkflowVisualizer({
  workflowId,
  etapeActuelleId,
  onEtapeChange,
  workflowHistory = [],
}: WorkflowVisualizerProps) {
  const workflow = getWorkflowById(workflowId)

  const [pendingEtapeId, setPendingEtapeId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  if (!workflow) {
    return (
      <div className="text-sm text-muted-foreground">
        Workflow introuvable
      </div>
    )
  }

  const progression = calculerProgression(workflowId, etapeActuelleId)
  const etapeActuelleIndex = workflow.etapes.findIndex((e) => e.id === etapeActuelleId)

  // Déterminer le type de transition vers une étape cible
  const getTransitionType = (targetIndex: number): TransitionType => {
    if (etapeActuelleIndex < 0) return 'initial'
    const diff = targetIndex - etapeActuelleIndex
    if (diff < 0) return 'revert'
    if (diff > 1) return 'bypass'
    return 'normal'
  }

  // Récupérer la date de passage à une étape depuis l'historique
  const getEtapeDate = (etapeId: string): Date | null => {
    const entry = workflowHistory.find((h) => h.etapeTo === etapeId)
    return entry ? new Date(entry.createdAt) : null
  }

  // Récupérer la note de transition pour une étape
  const getEtapeNote = (etapeId: string): string | null => {
    const entry = workflowHistory.find((h) => h.etapeTo === etapeId)
    return entry?.note ?? null
  }

  const handleEtapeClick = (etapeId: string) => {
    if (!onEtapeChange || etapeId === etapeActuelleId) return
    setPendingEtapeId(etapeId)
    setModalOpen(true)
  }

  const handleModalConfirm = async (note?: string) => {
    if (!pendingEtapeId || !onEtapeChange) return
    setModalOpen(false)
    await onEtapeChange(pendingEtapeId, note)
    setPendingEtapeId(null)
  }

  const handleModalCancel = () => {
    setModalOpen(false)
    setPendingEtapeId(null)
  }

  // Étape en attente dans la modale
  const pendingEtape = pendingEtapeId
    ? workflow.etapes.find((e) => e.id === pendingEtapeId)
    : null
  const pendingIndex = pendingEtapeId
    ? workflow.etapes.findIndex((e) => e.id === pendingEtapeId)
    : -1
  const pendingTransitionType =
    pendingIndex >= 0 ? getTransitionType(pendingIndex) : 'normal'
  const etapesSkippees =
    pendingTransitionType === 'bypass'
      ? Math.abs(pendingIndex - etapeActuelleIndex) - 1
      : undefined

  const etapeActuelleLibelle =
    workflow.etapes.find((e) => e.id === etapeActuelleId)?.libelle ?? etapeActuelleId

  const isInteractive = !!onEtapeChange

  return (
    <>
      <div className="space-y-4">
        {/* En-tête avec progression */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground">{workflow.nom}</h3>
            <span className="text-sm font-semibold text-blue-600">{progression}%</span>
          </div>

          {/* Barre de progression */}
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${progression}%` }}
            />
          </div>
        </div>

        {/* Liste des étapes */}
        <div className="space-y-3">
          {workflow.etapes.map((etape, index) => {
            const estActuelle = etape.id === etapeActuelleId
            const estTerminee = index < etapeActuelleIndex
            const estPending = etape.id === pendingEtapeId
            const transitionType = getTransitionType(index)
            const datePassage = getEtapeDate(etape.id)
            const notePassage = getEtapeNote(etape.id)

            // Tooltip selon type de transition
            const getTooltip = () => {
              if (estActuelle) return 'Étape actuelle'
              if (estTerminee) return `Étape terminée${datePassage ? ' le ' + datePassage.toLocaleDateString('fr-FR') : ''}`
              if (transitionType === 'bypass') return 'Cliquer pour sauter à cette étape (bypass)'
              if (transitionType === 'revert') return 'Cliquer pour revenir à cette étape'
              return 'Cliquer pour passer à cette étape'
            }

            return (
              <div
                key={etape.id}
                className={`relative pl-8 transition-opacity ${
                  estActuelle ? 'opacity-100' : estTerminee ? 'opacity-75' : 'opacity-50'
                } ${
                  isInteractive && !estActuelle
                    ? 'cursor-pointer group'
                    : estActuelle
                    ? 'cursor-default'
                    : ''
                }`}
                onClick={() => isInteractive && handleEtapeClick(etape.id)}
                title={isInteractive ? getTooltip() : undefined}
                role={isInteractive && !estActuelle ? 'button' : undefined}
                tabIndex={isInteractive && !estActuelle ? 0 : undefined}
                onKeyDown={(e) => {
                  if (isInteractive && !estActuelle && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    handleEtapeClick(etape.id)
                  }
                }}
                aria-label={isInteractive && !estActuelle ? `Passer à l'étape : ${etape.libelle}` : undefined}
              >
                {/* Ligne de connexion */}
                {index < workflow.etapes.length - 1 && (
                  <div
                    className={`absolute left-3 top-6 w-0.5 h-full ${
                      estTerminee ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                )}

                {/* Icône d'étape */}
                <div className="absolute left-0 top-0">
                  {estTerminee ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
                      <svg className="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : estActuelle ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 ring-4 ring-blue-100">
                      <div className="h-2 w-2 rounded-full bg-card" />
                    </div>
                  ) : isInteractive && estPending ? (
                    /* Étape en cours de sélection */
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-blue-400 bg-blue-50">
                      <div className="h-2 w-2 rounded-full bg-blue-400" />
                    </div>
                  ) : isInteractive ? (
                    /* Étape cliquable — icône selon direction */
                    <div
                      className={`h-6 w-6 rounded-full border-2 bg-card flex items-center justify-center text-xs transition-colors ${
                        transitionType === 'revert'
                          ? 'border-red-300 group-hover:border-red-500 group-hover:bg-red-50'
                          : transitionType === 'bypass'
                          ? 'border-orange-300 group-hover:border-orange-500 group-hover:bg-orange-50'
                          : 'border-gray-300 group-hover:border-blue-400 group-hover:bg-blue-50'
                      }`}
                    >
                      {transitionType === 'revert' ? (
                        <span className="text-red-400 group-hover:text-red-600" title="Retour">↩</span>
                      ) : transitionType === 'bypass' ? (
                        <span className="text-orange-400 group-hover:text-orange-600" title="Bypass">⏭</span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="h-6 w-6 rounded-full border-2 border bg-card" />
                  )}
                </div>

                {/* Contenu de l'étape */}
                <div className="pb-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          estActuelle
                            ? 'text-blue-900'
                            : estTerminee
                            ? 'text-foreground'
                            : isInteractive
                            ? 'text-muted-foreground group-hover:text-foreground transition-colors'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {etape.libelle}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{etape.description}</p>

                      {/* Date de passage si disponible */}
                      {datePassage && (
                        <p className="mt-0.5 text-xs text-green-600">
                          Passée le {datePassage.toLocaleDateString('fr-FR')}
                        </p>
                      )}

                      {/* Note de transition si disponible */}
                      {notePassage && (
                        <p className="mt-0.5 text-xs text-muted-foreground italic">
                          &ldquo;{notePassage}&rdquo;
                        </p>
                      )}

                      {/* Documents requis */}
                      {etape.documents_requis && etape.documents_requis.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {etape.documents_requis.map((doc) => (
                            <span
                              key={doc}
                              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              📄 {doc}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Délai moyen */}
                    {etape.delai_moyen_jours && etape.delai_moyen_jours > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground flex-shrink-0">
                        ~{etape.delai_moyen_jours}j
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modale de confirmation de transition */}
      {pendingEtape && (
        <WorkflowTransitionModal
          isOpen={modalOpen}
          etapeFromLibelle={etapeActuelleLibelle}
          etapeToLibelle={pendingEtape.libelle}
          typeTransition={pendingTransitionType}
          etapesSkippees={etapesSkippees}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}
    </>
  )
}
