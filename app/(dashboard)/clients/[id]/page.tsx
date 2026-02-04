import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ClientForm from '@/components/clients/ClientForm'

interface ClientDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params
  const supabase = await createClient()

  // Récupérer le client
  const { data: client, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !client) {
    notFound()
  }

  // Récupérer les dossiers du client
  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const displayName =
    client.type === 'PERSONNE_PHYSIQUE'
      ? `${client.nom} ${client.prenom || ''}`.trim()
      : client.denomination

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/clients"
              className="text-gray-500 hover:text-gray-700"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
          </div>
          <p className="mt-2 text-gray-600">
            Informations et dossiers du client
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Modifier les informations
            </h2>
            <ClientForm initialData={client} isEditing />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Statistiques */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Statistiques
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Dossiers actifs</span>
                <span className="text-lg font-bold text-blue-600">
                  {dossiers?.filter((d) => d.statut === 'ACTIF').length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Dossiers clos</span>
                <span className="text-lg font-bold text-gray-600">
                  {dossiers?.filter((d) => d.statut === 'CLOS').length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Total dossiers</span>
                <span className="text-lg font-bold text-gray-900">
                  {dossiers?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Dossiers récents */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Dossiers récents
            </h3>
            {dossiers && dossiers.length > 0 ? (
              <div className="space-y-3">
                {dossiers.slice(0, 5).map((dossier) => (
                  <Link
                    key={dossier.id}
                    href={`/dossiers/${dossier.id}`}
                    className="block rounded-md border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {dossier.numero_dossier}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          dossier.statut === 'ACTIF'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {dossier.statut}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 truncate">
                      {dossier.objet}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Aucun dossier pour ce client</p>
            )}
          </div>

          {/* Actions rapides */}
          <div className="rounded-lg border bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-500 mb-4">
              Actions rapides
            </h3>
            <div className="space-y-2">
              <Link
                href={`/dossiers/new?client_id=${client.id}`}
                className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
              >
                Créer un dossier
              </Link>
              <Link
                href={`/factures/new?client_id=${client.id}`}
                className="block w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Créer une facture
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
