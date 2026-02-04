import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import EcheancesWidget from '@/components/echeances/EcheancesWidget'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Récupérer les statistiques réelles
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', user.id)

  const { data: dossiersActifs } = await supabase
    .from('dossiers')
    .select('id')
    .eq('user_id', user.id)
    .eq('statut', 'ACTIF')

  const { data: factures } = await supabase
    .from('factures')
    .select('statut, montant_ttc')
    .eq('user_id', user.id)

  const facturesImpayees = factures?.filter((f) => f.statut === 'IMPAYEE') || []
  const montantImpaye = facturesImpayees.reduce(
    (acc, f) => acc + parseFloat(f.montant_ttc || 0),
    0
  )

  // Échéances critiques (7 prochains jours)
  const dans7Jours = new Date()
  dans7Jours.setDate(dans7Jours.getDate() + 7)

  const { data: echeancesCritiques } = await supabase
    .from('echeances')
    .select('id')
    .eq('statut', 'actif')
    .lte('date_echeance', dans7Jours.toISOString().split('T')[0])

  const stats = {
    clients: clients?.length || 0,
    dossiersActifs: dossiersActifs?.length || 0,
    echeancesCritiques: echeancesCritiques?.length || 0,
    montantImpaye: montantImpaye.toFixed(3),
    facturesImpayees: facturesImpayees.length,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="mt-2 text-gray-600">
          Vue d'ensemble de votre activité juridique
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/dossiers"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-500">Dossiers actifs</div>
              <div className="mt-2 text-3xl font-bold text-blue-600">
                {stats.dossiersActifs}
              </div>
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
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                />
              </svg>
            </div>
          </div>
        </Link>

        <Link
          href="/clients"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-500">Clients</div>
              <div className="mt-2 text-3xl font-bold text-indigo-600">
                {stats.clients}
              </div>
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
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          </div>
        </Link>

        <Link
          href="/echeances"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-500">Échéances (7j)</div>
              <div className="mt-2 text-3xl font-bold text-orange-600">
                {stats.echeancesCritiques}
              </div>
            </div>
            <div className="rounded-full bg-orange-100 p-3">
              <svg
                className="h-6 w-6 text-orange-600"
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
            </div>
          </div>
        </Link>

        <Link
          href="/factures"
          className="rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-500">Impayées</div>
              <div className="mt-2 text-2xl font-bold text-red-600">
                {stats.montantImpaye} <span className="text-lg">TND</span>
              </div>
              <div className="text-xs text-gray-500">
                {stats.facturesImpayees} facture(s)
              </div>
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
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </Link>
      </div>

      {/* Widgets */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Échéances urgentes */}
        <EcheancesWidget />

        {/* Actions rapides */}
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            ⚡ Actions rapides
          </h2>
          <div className="grid gap-3">
            <Link
              href="/clients/new"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="rounded-full bg-blue-100 p-2">
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Nouveau client</p>
                <p className="text-sm text-gray-500">Ajouter un client à votre portefeuille</p>
              </div>
            </Link>

            <Link
              href="/dossiers/new"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="rounded-full bg-indigo-100 p-2">
                <svg
                  className="h-5 w-5 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Nouveau dossier</p>
                <p className="text-sm text-gray-500">Ouvrir un nouveau dossier</p>
              </div>
            </Link>

            <Link
              href="/factures/new"
              className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="rounded-full bg-green-100 p-2">
                <svg
                  className="h-5 w-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">Nouvelle facture</p>
                <p className="text-sm text-gray-500">Créer une facture pour un client</p>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Modules disponibles */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-6">
        <h2 className="text-lg font-semibold text-green-900 mb-3">
          ✅ Modules disponibles
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-white px-3 py-2 text-sm text-center">
            ✅ Clients
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-sm text-center">
            ✅ Dossiers
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-sm text-center">
            ✅ Factures
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-sm text-center">
            ✅ Échéances
          </div>
        </div>
        <p className="mt-3 text-sm text-green-700">
          Votre plateforme de gestion juridique est opérationnelle. D'autres fonctionnalités seront ajoutées prochainement (Time Tracking, Documents, Templates).
        </p>
      </div>
    </div>
  )
}
