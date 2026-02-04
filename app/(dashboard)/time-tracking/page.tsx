import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ActiveTimer from '@/components/time-tracking/ActiveTimer'
import TimeEntryCard from '@/components/time-tracking/TimeEntryCard'

export default async function TimeTrackingPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Récupérer le timer actif
  const { data: activeTimer } = await supabase
    .from('time_entries')
    .select(`
      *,
      dossiers (
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
    .eq('user_id', user.id)
    .is('heure_fin', null)
    .single()

  // Récupérer toutes les entrées de temps
  const { data: timeEntries, error } = await supabase
    .from('time_entries')
    .select(`
      *,
      dossiers (
        id,
        numero_dossier,
        objet
      ),
      factures (
        numero_facture
      )
    `)
    .eq('user_id', user.id)
    .not('heure_fin', 'is', null) // Exclure le timer actif
    .order('date', { ascending: false })
    .order('heure_debut', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Erreur chargement entrées temps:', error)
  }

  // Statistiques
  const aujourdhui = new Date()
  const debutSemaine = new Date(aujourdhui)
  debutSemaine.setDate(aujourdhui.getDate() - aujourdhui.getDay())
  debutSemaine.setHours(0, 0, 0, 0)

  const debutMois = new Date(aujourdhui.getFullYear(), aujourdhui.getMonth(), 1)

  const entriesSemaine = timeEntries?.filter(
    (e) => new Date(e.date) >= debutSemaine
  ) || []
  const entriesMois = timeEntries?.filter(
    (e) => new Date(e.date) >= debutMois
  ) || []

  const stats = {
    totalEntrees: timeEntries?.length || 0,
    heuresSemaine: entriesSemaine.reduce((acc, e) => acc + (e.duree_minutes || 0), 0) / 60,
    heuresMois: entriesMois.reduce((acc, e) => acc + (e.duree_minutes || 0), 0) / 60,
    montantSemaine: entriesSemaine
      .filter((e) => e.facturable)
      .reduce((acc, e) => acc + parseFloat(e.montant_calcule || 0), 0),
    montantMois: entriesMois
      .filter((e) => e.facturable)
      .reduce((acc, e) => acc + parseFloat(e.montant_calcule || 0), 0),
    nonFacturees: timeEntries?.filter((e) => e.facturable && !e.facture_id).length || 0,
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Suivi du temps</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérez votre temps passé sur les dossiers pour optimiser votre facturation
          </p>
        </div>
        <Link
          href="/time-tracking/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
        >
          + Ajouter une entrée
        </Link>
      </div>

      {/* Timer actif */}
      {activeTimer && (
        <div>
          <ActiveTimer timer={activeTimer} />
        </div>
      )}

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Semaine</p>
              <p className="mt-1 text-2xl font-semibold text-blue-600">
                {stats.heuresSemaine.toFixed(1)}h
              </p>
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Mois</p>
              <p className="mt-1 text-2xl font-semibold text-indigo-600">
                {stats.heuresMois.toFixed(1)}h
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">À facturer (mois)</p>
              <p className="mt-1 text-xl font-semibold text-green-600">
                {stats.montantMois.toFixed(0)} <span className="text-sm">TND</span>
              </p>
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
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600">Non facturées</p>
              <p className="mt-1 text-2xl font-semibold text-orange-600">
                {stats.nonFacturees}
              </p>
              <p className="text-xs text-gray-500">entrée(s)</p>
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
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des entrées */}
      {!timeEntries || timeEntries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
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
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            Aucune entrée de temps
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Commencez à suivre votre temps pour optimiser votre facturation
          </p>
          <div className="mt-6">
            <Link
              href="/time-tracking/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Ajouter une entrée
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">
            Historique ({timeEntries.length} entrée(s))
          </h2>
          <div className="grid gap-4">
            {timeEntries.map((entry) => (
              <TimeEntryCard key={entry.id} entry={entry} showDossierInfo />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
