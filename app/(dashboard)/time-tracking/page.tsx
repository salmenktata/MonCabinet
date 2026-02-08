import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ActiveTimer from '@/components/time-tracking/ActiveTimer'
import TimeEntryCard from '@/components/time-tracking/TimeEntryCard'
import { getTranslations } from 'next-intl/server'

export default async function TimeTrackingPage() {
  const t = await getTranslations('timeTracking')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Note: La fonctionnalité de timer actif nécessite des colonnes supplémentaires
  // (heure_debut, heure_fin) qui seront ajoutées via migration
  const activeTimer = null

  // Récupérer toutes les entrées de temps
  const timeEntriesResult = await query(
    `SELECT te.*,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet
      ) as dossiers
    FROM time_entries te
    LEFT JOIN dossiers d ON te.dossier_id = d.id
    WHERE te.user_id = $1
    ORDER BY te.date DESC
    LIMIT 50`,
    [session.user.id]
  )
  const timeEntries = timeEntriesResult.rows

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
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Link
          href="/time-tracking/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700"
        >
          + {t('newEntry')}
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
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('week')}</p>
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

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('month')}</p>
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

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('toBillMonth')}</p>
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

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('notBilled')}</p>
              <p className="mt-1 text-2xl font-semibold text-orange-600">
                {stats.nonFacturees}
              </p>
              <p className="text-xs text-muted-foreground">{t('entries')}</p>
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
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
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
          <p className="mt-2 text-sm font-medium text-foreground">
            {t('noEntries')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstEntry')}
          </p>
          <div className="mt-6">
            <Link
              href="/time-tracking/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + {t('newEntry')}
            </Link>
          </div>
        </div>
      ) : (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-foreground">
            {t('history')} ({timeEntries.length} {t('entries')})
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
