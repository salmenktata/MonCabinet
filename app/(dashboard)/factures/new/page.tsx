import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import FactureForm from '@/components/factures/FactureForm'

export default async function NewFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; dossier_id?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer tous les clients pour le formulaire
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, type, nom, prenom, denomination')
    .eq('user_id', user.id)
    .order('nom', { ascending: true })

  if (clientsError) {
    console.error('Erreur chargement clients:', clientsError)
  }

  // Récupérer tous les dossiers pour le formulaire
  const { data: dossiers, error: dossiersError } = await supabase
    .from('dossiers')
    .select('id, numero_dossier, objet, client_id')
    .eq('user_id', user.id)
    .eq('statut', 'ACTIF')
    .order('created_at', { ascending: false })

  if (dossiersError) {
    console.error('Erreur chargement dossiers:', dossiersError)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Nouvelle facture</h1>
        <p className="mt-1 text-sm text-gray-500">
          Créez une facture pour un client ou un dossier
        </p>
      </div>

      {/* Formulaire */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {!clients || clients.length === 0 ? (
          <div className="rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Aucun client trouvé
                </h3>
                <p className="mt-2 text-sm text-yellow-700">
                  Vous devez créer au moins un client avant de pouvoir créer une facture.
                </p>
                <div className="mt-4">
                  <a
                    href="/clients/new"
                    className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
                  >
                    Créer un client →
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <FactureForm
            clients={clients || []}
            dossiers={dossiers || []}
            preselectedClientId={params.client_id}
            preselectedDossierId={params.dossier_id}
          />
        )}
      </div>
    </div>
  )
}
