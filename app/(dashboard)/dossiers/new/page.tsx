import { createClient } from '@/lib/supabase/server'
import DossierForm from '@/components/dossiers/DossierForm'

interface NewDossierPageProps {
  searchParams: Promise<{ client_id?: string }>
}

export default async function NewDossierPage({ searchParams }: NewDossierPageProps) {
  const params = await searchParams
  const supabase = await createClient()

  // Récupérer tous les clients pour le formulaire
  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Nouveau dossier</h1>
        <p className="mt-2 text-gray-600">
          Créez un nouveau dossier et démarrez le workflow
        </p>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <DossierForm
          clients={clients || []}
          preselectedClientId={params.client_id}
        />
      </div>
    </div>
  )
}
