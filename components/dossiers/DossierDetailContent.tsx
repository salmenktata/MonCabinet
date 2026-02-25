'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import WorkflowVisualizer from '../workflows/WorkflowVisualizer'
import ActionsList from './ActionsList'
import AddActionForm from './AddActionForm'
import DossierForm from './DossierForm'
import EcheanceCard from '@/components/echeances/EcheanceCard'
import { EcheanceFormAdvanced } from '@/components/echeances/EcheanceFormAdvanced'
import { updateDossierEtapeAction, getWorkflowHistoryAction } from '@/app/actions/dossiers'
import type { WorkflowHistoryEntry } from '@/app/actions/dossiers'
import { getWorkflowById } from '@/lib/workflows/workflows-config'

interface DossierDetailContentProps {
  dossier: any
  actions: any[]
  echeances: any[]
  documents: any[]
  initialTab: string
}

const TRANSITION_ICONS: Record<string, string> = {
  initial: '🟢',
  normal: '➡️',
  bypass: '⏭️',
  revert: '↩️',
}

const TRANSITION_LABELS: Record<string, string> = {
  initial: 'Initialisation',
  normal: 'Avancement',
  bypass: 'Bypass',
  revert: 'Retour',
}

const TRANSITION_COLORS: Record<string, string> = {
  initial: 'text-blue-700',
  normal: 'text-green-700',
  bypass: 'text-orange-700',
  revert: 'text-red-700',
}

export default function DossierDetailContent({
  dossier,
  actions,
  echeances,
  documents,
  initialTab,
}: DossierDetailContentProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [showAddAction, setShowAddAction] = useState(false)
  const [showAddEcheance, setShowAddEcheance] = useState(false)
  const [updatingEtape, setUpdatingEtape] = useState(false)
  const [workflowHistory, setWorkflowHistory] = useState<WorkflowHistoryEntry[]>([])

  // Charger l'historique du workflow
  useEffect(() => {
    if (!dossier?.id) return
    getWorkflowHistoryAction(dossier.id).then((res) => {
      if (res.success && res.data) {
        setWorkflowHistory(res.data)
      }
    })
  }, [dossier?.id])

  const handleEtapeChange = useCallback(async (etapeId: string, note?: string) => {
    setUpdatingEtape(true)
    const result = await updateDossierEtapeAction(dossier.id, etapeId, note)
    setUpdatingEtape(false)

    if (result.success) {
      // Recharger l'historique après transition
      const histRes = await getWorkflowHistoryAction(dossier.id)
      if (histRes.success && histRes.data) {
        setWorkflowHistory(histRes.data)
      }
      router.refresh()
    }
  }, [dossier.id, router])

  // Mémoriser les onglets pour éviter les re-renders
  const tabs = useMemo(() => [
    { id: 'workflow', label: 'Workflow', icon: '🔄' },
    { id: 'info', label: 'Informations', icon: 'ℹ️' },
    { id: 'actions', label: `Actions (${actions.length})`, icon: '✅' },
    { id: 'echeances', label: `Échéances (${echeances.length})`, icon: '📅' },
    { id: 'documents', label: `Documents (${documents.length})`, icon: '📁' },
  ], [actions.length, echeances.length, documents.length])

  // Résoudre les libellés d'étapes pour l'historique
  const workflowId = dossier.type_procedure || 'civil_premiere_instance'
  const workflow = getWorkflowById(workflowId)
  const getEtapeLibelle = (etapeId: string | null): string => {
    if (!etapeId) return '—'
    return workflow?.etapes.find((e) => e.id === etapeId)?.libelle ?? etapeId
  }

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="border-b border">
        <nav className="-mb-px flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-accent'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu des onglets */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {activeTab === 'workflow' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Workflow de la procédure
                </h2>
                {updatingEtape && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Mise à jour…
                  </span>
                )}
              </div>

              <WorkflowVisualizer
                workflowId={workflowId}
                etapeActuelleId={dossier.workflow_etape_actuelle || 'ASSIGNATION'}
                onEtapeChange={handleEtapeChange}
                workflowHistory={workflowHistory}
              />
            </div>

            {/* Panneau historique des transitions */}
            {workflowHistory.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  Historique des transitions
                </h3>
                <div className="space-y-2">
                  {/* Ordre chronologique : du plus récent au plus ancien */}
                  {workflowHistory.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
                    >
                      {/* Icône type de transition */}
                      <span className="flex-shrink-0 text-base" aria-hidden="true">
                        {TRANSITION_ICONS[entry.typeTransition] ?? '•'}
                      </span>

                      {/* Contenu */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span
                            className={`font-medium ${TRANSITION_COLORS[entry.typeTransition] ?? 'text-foreground'}`}
                          >
                            {TRANSITION_LABELS[entry.typeTransition] ?? entry.typeTransition}
                          </span>
                          <span className="text-muted-foreground">—</span>
                          <span className="text-foreground">
                            {getEtapeLibelle(entry.etapeFrom)}
                          </span>
                          <svg className="h-3 w-3 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <span className="text-foreground font-medium">
                            {getEtapeLibelle(entry.etapeTo)}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="mt-0.5 text-xs text-muted-foreground italic">
                            &ldquo;{entry.note}&rdquo;
                          </p>
                        )}
                      </div>

                      {/* Date */}
                      <span className="flex-shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'info' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Modifier les informations
            </h2>
            <DossierForm initialData={dossier} isEditing clients={dossier.client ? [dossier.client] : []} />
          </div>
        )}

        {activeTab === 'actions' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Actions à faire ({actions.length})
              </h2>
              {!showAddAction && (
                <button
                  onClick={() => setShowAddAction(true)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  + Ajouter action
                </button>
              )}
            </div>

            {showAddAction && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h3 className="text-sm font-medium text-foreground mb-3">
                  Nouvelle action
                </h3>
                <AddActionForm
                  dossierId={dossier.id}
                  onCancel={() => setShowAddAction(false)}
                />
              </div>
            )}

            <ActionsList actions={actions} dossierId={dossier.id} />
          </div>
        )}

        {activeTab === 'echeances' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Échéances ({echeances.length})
              </h2>
              {!showAddEcheance && (
                <button
                  onClick={() => setShowAddEcheance(true)}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  + Ajouter échéance
                </button>
              )}
            </div>

            {showAddEcheance && (
              <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-foreground">
                    Nouvelle échéance
                  </h3>
                  <button
                    onClick={() => setShowAddEcheance(false)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    ✕ Annuler
                  </button>
                </div>
                <EcheanceFormAdvanced dossierId={dossier.id} />
              </div>
            )}

            {echeances.length > 0 ? (
              <div className="space-y-3">
                {echeances.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border bg-muted p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucune échéance</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                Documents ({documents.length})
              </h2>
              <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                + Ajouter document
              </button>
            </div>

            {documents.length > 0 ? (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border p-4 hover:border-blue-300"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📄</span>
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">{doc.nom}</h4>
                        <p className="text-sm text-muted-foreground">
                          {doc.type_document} •{' '}
                          {new Date(doc.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border bg-muted p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucun document</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
