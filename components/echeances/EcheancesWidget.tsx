import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { joursRestants, niveauUrgence } from '@/lib/utils/delais-tunisie'

export default async function EcheancesWidget() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Récupérer les échéances des 7 prochains jours
  const dans7Jours = new Date()
  dans7Jours.setDate(dans7Jours.getDate() + 7)

  const { data: echeances } = await supabase
    .from('echeances')
    .select(`
      *,
      dossiers (
        id,
        numero_dossier,
        objet,
        clients (
          nom,
          prenom,
          denomination,
          type
        )
      )
    `)
    .eq('statut', 'actif')
    .lte('date_echeance', dans7Jours.toISOString().split('T')[0])
    .order('date_echeance', { ascending: true })
    .limit(5)

  if (!echeances || echeances.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          ⏰ Échéances urgentes
        </h2>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            Aucune échéance dans les 7 prochains jours
          </p>
          <p className="mt-2 text-2xl">✅</p>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          ⏰ Échéances urgentes
        </h2>
        <Link
          href="/echeances"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          Voir tout →
        </Link>
      </div>

      <div className="space-y-3">
        {echeances.map((echeance) => {
          const dateEcheance = new Date(echeance.date_echeance)
          const jours = joursRestants(dateEcheance)
          const urgence = niveauUrgence(dateEcheance)

          const urgenceColor =
            urgence === 'depasse'
              ? 'bg-red-100 text-red-700'
              : urgence === 'critique'
              ? 'bg-orange-100 text-orange-700'
              : urgence === 'urgent'
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-blue-100 text-blue-700'

          const clientName = echeance.dossiers?.clients
            ? echeance.dossiers.clients.type === 'PERSONNE_PHYSIQUE'
              ? `${echeance.dossiers.clients.nom} ${echeance.dossiers.clients.prenom || ''}`.trim()
              : echeance.dossiers.clients.denomination
            : ''

          return (
            <Link
              key={echeance.id}
              href={`/dossiers/${echeance.dossier_id}#echeances`}
              className={`block rounded-lg border-l-4 p-3 hover:bg-gray-50 transition-colors ${
                urgence === 'depasse'
                  ? 'border-red-500'
                  : urgence === 'critique'
                  ? 'border-orange-500'
                  : urgence === 'urgent'
                  ? 'border-yellow-500'
                  : 'border-blue-500'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {echeance.titre}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 truncate">
                    {echeance.dossiers?.numero_dossier} - {clientName}
                  </p>
                </div>
                <span
                  className={`ml-2 inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${urgenceColor}`}
                >
                  {jours < 0
                    ? `${Math.abs(jours)}j retard`
                    : jours === 0
                    ? "Aujourd'hui"
                    : `${jours}j`}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {dateEcheance.toLocaleDateString('fr-FR', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </p>
            </Link>
          )
        })}
      </div>

      {echeances.length >= 5 && (
        <div className="mt-4 pt-3 border-t text-center">
          <Link
            href="/echeances"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Voir toutes les échéances →
          </Link>
        </div>
      )}
    </div>
  )
}
