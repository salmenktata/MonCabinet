'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import WorkflowVisualizer from '../workflows/WorkflowVisualizer'
import ActionsList from './ActionsList'
import AddActionForm from './AddActionForm'
import DossierForm from './DossierForm'
import { updateDossierEtapeAction } from '@/app/actions/dossiers'

interface DossierDetailContentProps {
  dossier: any
  actions: any[]
  echeances: any[]
  documents: any[]
  initialTab: string
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
  const [updatingEtape, setUpdatingEtape] = useState(false)

  const handleEtapeChange = useCallback(async (etapeId: string) => {
    if (!confirm('Changer l\'étape du workflow ?')) return

    setUpdatingEtape(true)
    await updateDossierEtapeAction(dossier.id, etapeId)
    setUpdatingEtape(false)
    router.refresh()
  }, [dossier.id, router])

  // Mémoriser les onglets pour éviter les re-renders
  const tabs = useMemo(() => [
    { id: 'workflow', label: 'Workflow', icon: '🔄' },
    { id: 'info', label: 'Informations', icon: 'ℹ️' },
    { id: 'actions', label: `Actions (${actions.length})`, icon: '✅' },
    { id: 'echeances', label: `Échéances (${echeances.length})`, icon: '📅' },
    { id: 'documents', label: `Documents (${documents.length})`, icon: '📁' },
  ], [actions.length, echeances.length, documents.length])

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
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Workflow de la procédure
            </h2>
            <WorkflowVisualizer
              workflowId={dossier.type_procedure || 'civil_premiere_instance'}
              etapeActuelleId={dossier.workflow_etape_actuelle || 'ASSIGNATION'}
            />
          </div>
        )}

        {activeTab === 'info' && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Modifier les informations
            </h2>
            <DossierForm initialData={dossier} isEditing clients={[dossier.clients]} />
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
              <button className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                + Ajouter échéance
              </button>
            </div>

            {echeances.length > 0 ? (
              <div className="space-y-3">
                {echeances.map((echeance) => (
                  <div
                    key={echeance.id}
                    className="rounded-lg border p-4 hover:border-blue-300"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-medium text-foreground">
                          {echeance.titre}
                        </h4>
                        {echeance.description && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {echeance.description}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-blue-600">
                          📅{' '}
                          {new Date(echeance.date_evenement).toLocaleDateString(
                            'fr-FR'
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
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
