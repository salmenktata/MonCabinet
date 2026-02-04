import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Récupérer les statistiques (pour l'instant elles seront à 0)
  const { data: stats } = await supabase
    .from('dashboard_stats')
    .select('*')
    .eq('user_id', user?.id)
    .single()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Tableau de bord
        </h1>
        <p className="mt-2 text-gray-600">
          Bienvenue sur votre plateforme de gestion juridique
        </p>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Dossiers actifs
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {stats?.dossiers_actifs || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Clients
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {stats?.total_clients || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Actions urgentes
          </div>
          <div className="mt-2 text-3xl font-bold text-red-600">
            {stats?.actions_urgentes || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="text-sm font-medium text-gray-500">
            Factures impayées
          </div>
          <div className="mt-2 text-3xl font-bold text-orange-600">
            {stats?.montant_impaye || 0} TND
          </div>
        </div>
      </div>

      {/* Message de bienvenue */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
        <h2 className="text-lg font-semibold text-blue-900">
          🎉 Félicitations ! Votre compte est créé
        </h2>
        <p className="mt-2 text-blue-700">
          Vous pouvez maintenant commencer à utiliser la plateforme.
          Les modules Clients, Dossiers et Factures seront bientôt disponibles.
        </p>
        <div className="mt-4 flex gap-3">
          <div className="rounded-md bg-white px-3 py-2 text-sm">
            ✅ Authentification fonctionnelle
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-sm">
            ✅ Base de données configurée
          </div>
          <div className="rounded-md bg-white px-3 py-2 text-sm">
            ✅ Profil utilisateur créé
          </div>
        </div>
      </div>
    </div>
  )
}
