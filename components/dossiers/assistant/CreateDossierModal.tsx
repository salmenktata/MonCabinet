'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type {
  StructuredDossier,
  NewClientData,
} from '@/lib/ai/dossier-structuring-service'

export type { NewClientData }

interface Client {
  id: string
  nom: string
  prenom?: string
  type_client: string
}

interface CreateDossierModalProps {
  clients: Client[]
  result: StructuredDossier
  onClose: () => void
  onConfirm: (
    clientId: string | null,
    newClientData: NewClientData | null,
    options: {
      creerActions: boolean
      creerEcheances: boolean
      actionsSelectionnees?: string[]
    }
  ) => void
  loading: boolean
}

export default function CreateDossierModal({
  clients,
  result,
  onClose,
  onConfirm,
  loading,
}: CreateDossierModalProps) {
  const t = useTranslations('assistant')
  const tCommon = useTranslations('common')

  const [clientMode, setClientMode] = useState<'existing' | 'new'>(
    clients.length > 0 ? 'existing' : 'new'
  )
  const [selectedClientId, setSelectedClientId] = useState('')
  const [newClientData, setNewClientData] = useState<NewClientData>({
    nom: result.client?.nom || '',
    prenom: result.client?.prenom || '',
    type_client: 'PERSONNE_PHYSIQUE',
    telephone: '',
    email: '',
  })
  const [creerActions, setCreerActions] = useState(true)
  const [creerEcheances, setCreerEcheances] = useState(true)

  const checkedActions = result.actionsSuggerees.filter((a) => a.checked)
  const obligatorySteps = result.timeline.filter((s) => s.obligatoire)

  const options = {
    creerActions,
    creerEcheances,
    actionsSelectionnees: checkedActions.map((_, i) => i.toString()),
  }

  const handleConfirm = () => {
    if (clientMode === 'existing') {
      if (!selectedClientId) return
      onConfirm(selectedClientId, null, options)
    } else {
      if (!newClientData.nom.trim()) return
      onConfirm(null, newClientData, options)
    }
  }

  const isConfirmDisabled =
    loading ||
    (clientMode === 'existing' && !selectedClientId) ||
    (clientMode === 'new' && !newClientData.nom.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-card shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold text-foreground">
            {t('createModal.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Résumé du dossier */}
          <div className="rounded-lg bg-muted/50 p-4">
            <h3 className="font-semibold text-foreground">
              {result.titrePropose}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {result.resumeCourt}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-300">
                {t(`procedureTypes.${result.typeProcedure}`)}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {checkedActions.length} actions
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {obligatorySteps.length} échéances
              </span>
            </div>
          </div>

          {/* Sélection du client */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('createModal.selectClient')} *
            </label>

            {/* Tabs existant / nouveau */}
            <div className="flex rounded-lg border bg-muted/30 p-1 gap-1 mb-3">
              {clients.length > 0 && (
                <button
                  type="button"
                  onClick={() => setClientMode('existing')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    clientMode === 'existing'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Client existant
                </button>
              )}
              <button
                type="button"
                onClick={() => setClientMode('new')}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  clientMode === 'new'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Nouveau client
              </button>
            </div>

            {/* Mode client existant */}
            {clientMode === 'existing' && (
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">{t('createModal.chooseClient')}</option>
                {clients.map((client) => {
                  const displayName =
                    client.type_client === 'PERSONNE_PHYSIQUE' ||
                    client.type_client === 'personne_physique'
                      ? `${client.nom} ${client.prenom || ''}`.trim()
                      : client.nom
                  return (
                    <option key={client.id} value={client.id}>
                      {displayName}
                    </option>
                  )
                })}
              </select>
            )}

            {/* Mode nouveau client */}
            {clientMode === 'new' && (
              <div className="space-y-3">
                {/* Type client */}
                <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setNewClientData((d) => ({
                        ...d,
                        type_client: 'PERSONNE_PHYSIQUE',
                      }))
                    }
                    className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      newClientData.type_client === 'PERSONNE_PHYSIQUE'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Personne physique
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setNewClientData((d) => ({
                        ...d,
                        type_client: 'PERSONNE_MORALE',
                      }))
                    }
                    className={`flex-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                      newClientData.type_client === 'PERSONNE_MORALE'
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Personne morale
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {newClientData.type_client === 'PERSONNE_MORALE'
                        ? 'Dénomination *'
                        : 'Nom *'}
                    </label>
                    <input
                      type="text"
                      value={newClientData.nom}
                      onChange={(e) =>
                        setNewClientData((d) => ({ ...d, nom: e.target.value }))
                      }
                      placeholder={
                        newClientData.type_client === 'PERSONNE_MORALE'
                          ? 'Raison sociale'
                          : 'Nom de famille'
                      }
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>

                  {newClientData.type_client === 'PERSONNE_PHYSIQUE' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">
                        Prénom
                      </label>
                      <input
                        type="text"
                        value={newClientData.prenom || ''}
                        onChange={(e) =>
                          setNewClientData((d) => ({
                            ...d,
                            prenom: e.target.value,
                          }))
                        }
                        placeholder="Prénom"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Téléphone
                    </label>
                    <input
                      type="tel"
                      value={newClientData.telephone || ''}
                      onChange={(e) =>
                        setNewClientData((d) => ({
                          ...d,
                          telephone: e.target.value,
                        }))
                      }
                      placeholder="+216 XX XXX XXX"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={newClientData.email || ''}
                      onChange={(e) =>
                        setNewClientData((d) => ({
                          ...d,
                          email: e.target.value,
                        }))
                      }
                      placeholder="email@exemple.com"
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={creerActions}
                onChange={(e) => setCreerActions(e.target.checked)}
                className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-foreground">
                {t('createModal.createActions', { count: checkedActions.length })}
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={creerEcheances}
                onChange={(e) => setCreerEcheances(e.target.checked)}
                className="h-4 w-4 rounded border-border text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-foreground">
                {t('createModal.createDeadlines', {
                  count: obligatorySteps.length,
                })}
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t p-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border bg-card px-4 py-2 text-foreground font-medium hover:bg-muted disabled:opacity-50"
          >
            {tCommon('cancel')}
          </button>

          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('createModal.creating')}
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {t('createModal.confirm')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
