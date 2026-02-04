import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ClientCard from '@/components/clients/ClientCard'

export default async function ClientsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Récupérer tous les clients
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clients</h1>
          <p className="mt-2 text-gray-600">
            Gérez vos clients et leurs informations
          </p>
        </div>

        <Link
          href="/clients/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + Nouveau client
        </Link>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Total clients
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {clients?.length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Personnes physiques
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {clients?.filter((c) => c.type === 'PERSONNE_PHYSIQUE').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Personnes morales
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {clients?.filter((c) => c.type === 'PERSONNE_MORALE').length || 0}
          </div>
        </div>
      </div>

      {/* Liste des clients */}
      {clients && clients.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun client</h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez par créer votre premier client
          </p>
          <div className="mt-6">
            <Link
              href="/clients/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + Nouveau client
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
