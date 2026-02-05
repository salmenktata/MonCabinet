import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CabinetForm from '@/components/parametres/CabinetForm'

export const metadata = {
  title: 'Paramètres Cabinet - Avocat SaaS',
  description: 'Gérer les informations de votre cabinet',
}

export default async function CabinetParametresPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le profil avec les infos cabinet
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Paramètres du Cabinet</h1>
        <p className="mt-2 text-muted-foreground">
          Gérez les informations de votre cabinet pour les factures conformes ONAT
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6">
        <CabinetForm profile={profile} />
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <h3 className="font-semibold text-yellow-900">ℹ️ Informations importantes</h3>
        <ul className="mt-2 space-y-1 text-sm text-yellow-800">
          <li>• Ces informations apparaîtront sur toutes vos factures PDF</li>
          <li>• Le logo est optionnel mais recommandé pour un aspect professionnel</li>
          <li>
            • Le numéro RNE (Registre National des Entreprises) est optionnel mais requis pour
            certains clients
          </li>
          <li>
            • Assurez-vous que votre matricule avocat ONAT est correctement renseigné (obligation
            légale)
          </li>
        </ul>
      </div>
    </div>
  )
}
