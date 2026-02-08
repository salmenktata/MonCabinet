import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FactureCard from '@/components/factures/FactureCard'
import { getTranslations } from 'next-intl/server'

export default async function FacturesPage() {
  const t = await getTranslations('factures')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer toutes les factures avec les informations du client
  const result = await query(
    `SELECT f.*,
      json_build_object(
        'id', c.id,
        'type_client', c.type_client,
        'nom', c.nom,
        'prenom', c.prenom
      ) as clients,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet
      ) as dossiers
    FROM factures f
    LEFT JOIN clients c ON f.client_id = c.id
    LEFT JOIN dossiers d ON f.dossier_id = d.id
    WHERE f.user_id = $1
    ORDER BY f.date_emission DESC`,
    [session.user.id]
  )
  const factures = result.rows

  // Calculer les statistiques
  const stats = {
    total: factures?.length || 0,
    brouillon: factures?.filter((f) => f.statut === 'brouillon').length || 0,
    envoyees: factures?.filter((f) => f.statut === 'envoyee').length || 0,
    payees: factures?.filter((f) => f.statut === 'payee').length || 0,
    impayees: factures?.filter((f) => f.statut === 'envoyee').length || 0,
    montantTotal: factures?.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
    montantPaye: factures?.filter((f) => f.statut === 'payee').reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
    montantImpaye: factures?.filter((f) => f.statut === 'envoyee').reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
  }

  // Factures en retard
  const facturesEnRetard = factures?.filter(
    (f) =>
      f.statut === 'envoyee' &&
      f.date_echeance &&
      new Date(f.date_echeance) < new Date()
  ).length || 0

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Link
          href="/factures/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
        >
          + {t('newInvoice')}
        </Link>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('totalInvoices')}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{stats.total}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <svg
                className="h-6 w-6 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('totalAmountTTC')}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {stats.montantTotal.toFixed(3)} <span className="text-lg">TND</span>
              </p>
            </div>
            <div className="rounded-full bg-indigo-100 p-3">
              <svg
                className="h-6 w-6 text-indigo-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('paid')}</p>
              <p className="mt-1 text-2xl font-semibold text-green-600">
                {stats.montantPaye.toFixed(3)} <span className="text-lg">TND</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{stats.payees} {t('invoicesCount')}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('unpaid')}</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">
                {stats.montantImpaye.toFixed(3)} <span className="text-lg">TND</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.impayees} {t('invoicesCount')}
                {facturesEnRetard > 0 && (
                  <span className="ml-1 font-semibold text-red-700">
                    ({facturesEnRetard} {t('overdue')})
                  </span>
                )}
              </p>
            </div>
            <div className="rounded-full bg-red-100 p-3">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres par statut */}
      <div className="flex gap-2 rounded-lg border bg-card p-4">
        <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground">
          {t('draft')} ({stats.brouillon})
        </span>
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
          {t('sent')} ({stats.envoyees})
        </span>
        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
          {t('paid')} ({stats.payees})
        </span>
        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
          {t('unpaid')} ({stats.impayees})
        </span>
      </div>

      {/* Liste des factures */}
      {!factures || factures.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-foreground">{t('noInvoices')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstInvoice')}
          </p>
          <div className="mt-6">
            <Link
              href="/factures/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + {t('newInvoice')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {factures.map((facture) => (
            <FactureCard key={facture.id} facture={facture} />
          ))}
        </div>
      )}
    </div>
  )
}
