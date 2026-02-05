'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { deleteFactureAction, changerStatutFactureAction, envoyerFactureEmailAction } from '@/app/actions/factures'

interface FactureCardProps {
  facture: any
}

const statutColors: Record<string, string> = {
  BROUILLON: 'bg-muted text-foreground',
  ENVOYEE: 'bg-blue-100 text-blue-700',
  PAYEE: 'bg-green-100 text-green-700',
  IMPAYEE: 'bg-red-100 text-red-700',
}

export default function FactureCard({ facture }: FactureCardProps) {
  const router = useRouter()
  const t = useTranslations('cards')
  const [showActions, setShowActions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    if (!confirm(t('deleteInvoice'))) return

    setLoading(true)
    const result = await deleteFactureAction(facture.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    router.refresh()
  }

  const handleChangeStatut = async (newStatut: string) => {
    setLoading(true)
    const result = await changerStatutFactureAction(facture.id, newStatut)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    setShowActions(false)
    router.refresh()
  }

  const handleEnvoyerEmail = async () => {
    if (!facture.clients?.email) {
      setError('Le client n\'a pas d\'adresse email')
      return
    }

    if (!confirm(`Envoyer la facture par email à ${facture.clients.email} ?`)) {
      return
    }

    setLoading(true)
    setError('')

    const result = await envoyerFactureEmailAction(facture.id)

    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    alert(`✅ ${result.message}`)
    setLoading(false)
    router.refresh()
  }

  const clientName = facture.clients
    ? facture.clients.type === 'PERSONNE_PHYSIQUE'
      ? `${facture.clients.nom} ${facture.clients.prenom || ''}`.trim()
      : facture.clients.denomination
    : t('clientDeleted')

  const isRetard =
    facture.statut === 'IMPAYEE' &&
    facture.date_echeance &&
    new Date(facture.date_echeance) < new Date()

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {facture.numero_facture}
            </h3>
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                statutColors[facture.statut]
              }`}
            >
              {facture.statut}
            </span>
            {isRetard && (
              <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-red-100 text-red-700">
                ⚠️ {t('lateWarning')}
              </span>
            )}
          </div>

          <p className="mt-1 text-sm text-muted-foreground">{facture.objet}</p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              <span>{clientName}</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>
                {t('issuedOn')} {new Date(facture.date_emission).toLocaleDateString('fr-FR')}
              </span>
            </div>

            {facture.date_echeance && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  {t('dueDate')} {new Date(facture.date_echeance).toLocaleDateString('fr-FR')}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">{t('amountTTC')}</p>
              <p className="text-2xl font-bold text-blue-600">
                {parseFloat(facture.montant_ttc).toFixed(3)} TND
              </p>
            </div>

            {facture.date_paiement && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t('paidOn')}</p>
                <p className="text-sm font-medium text-green-600">
                  {new Date(facture.date_paiement).toLocaleDateString('fr-FR')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <Link
          href={`/factures/${facture.id}`}
          className="flex-1 rounded-md border border-blue-600 bg-card px-3 py-2 text-center text-sm font-medium text-blue-600 hover:bg-blue-50"
        >
          {t('viewDetails')}
        </Link>

        <a
          href={`/api/factures/${facture.id}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-green-600 bg-card px-3 py-2 text-sm font-medium text-green-600 hover:bg-green-50 flex items-center gap-1"
          title="Télécharger PDF"
        >
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
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          PDF
        </a>

        <button
          onClick={() => setShowActions(!showActions)}
          disabled={loading}
          className="rounded-md border border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          {showActions ? t('close') : t('actions')}
        </button>
      </div>

      {showActions && (
        <div className="mt-3 space-y-2 rounded-md bg-muted p-3">
          {facture.clients?.email && (
            <button
              onClick={handleEnvoyerEmail}
              disabled={loading}
              className="w-full rounded-md bg-purple-600 px-3 py-2 text-sm text-white hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
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
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Envoyer par email
            </button>
          )}

          {facture.statut !== 'PAYEE' && (
            <button
              onClick={() => handleChangeStatut('PAYEE')}
              disabled={loading}
              className="w-full rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
            >
              {t('markAsPaid')}
            </button>
          )}

          {facture.statut === 'BROUILLON' && (
            <button
              onClick={() => handleChangeStatut('ENVOYEE')}
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('markAsSent')}
            </button>
          )}

          <button
            onClick={handleDelete}
            disabled={loading}
            className="w-full rounded-md border border-red-300 bg-card px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {t('delete')}
          </button>
        </div>
      )}
    </div>
  )
}
