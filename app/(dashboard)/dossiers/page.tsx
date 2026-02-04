import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import DossierCard from '@/components/dossiers/DossierCard'

export default async function DossiersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Récupérer tous les dossiers avec les clients
  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('*, clients(*)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dossiers</h1>
          <p className="mt-2 text-gray-600">
            Gérez vos dossiers et suivez leur progression
          </p>
        </div>

        <Link
          href="/dossiers/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + Nouveau dossier
        </Link>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Total dossiers
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {dossiers?.length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Dossiers actifs
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">
            {dossiers?.filter((d) => d.statut === 'ACTIF').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Dossiers clos
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-600">
            {dossiers?.filter((d) => d.statut === 'CLOS').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Procédures civiles
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {dossiers?.filter((d) => d.type_procedure === 'CIVIL').length || 0}
          </div>
        </div>
      </div>

      {/* Liste des dossiers */}
      {dossiers && dossiers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dossiers.map((dossier) => (
            <DossierCard key={dossier.id} dossier={dossier} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
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
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Aucun dossier
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par créer votre premier dossier
          </p>
          <div className="mt-6">
            <Link
              href="/dossiers/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Nouveau dossier
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
