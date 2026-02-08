import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import EcheanceCard from '@/components/echeances/EcheanceCard'
import { niveauUrgence } from '@/lib/utils/delais-tunisie'
import { getTranslations } from 'next-intl/server'

export default async function EcheancesPage() {
  const t = await getTranslations('echeances')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Récupérer toutes les échéances actives
  const result = await query(
    `SELECT e.*,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet,
        'clients', json_build_object(
          'id', c.id,
          'type_client', c.type_client,
          'nom', c.nom,
          'prenom', c.prenom
        )
      ) as dossiers
    FROM echeances e
    LEFT JOIN dossiers d ON e.dossier_id = d.id
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE e.user_id = $1 AND e.statut = $2
    ORDER BY e.date_echeance ASC`,
    [session.user.id, 'actif']
  )
  const echeances = result.rows

  // Statistiques
  const aujourdhui = new Date()
  aujourdhui.setHours(0, 0, 0, 0)

  const stats = {
    total: echeances?.length || 0,
    depassees: echeances?.filter((e) => new Date(e.date_echeance) < aujourdhui).length || 0,
    critiques: echeances?.filter((e) => {
      const urgence = niveauUrgence(new Date(e.date_echeance))
      return urgence === 'critique' && new Date(e.date_echeance) >= aujourdhui
    }).length || 0,
    urgentes: echeances?.filter((e) => {
      const urgence = niveauUrgence(new Date(e.date_echeance))
      return urgence === 'urgent'
    }).length || 0,
    audiences: echeances?.filter((e) => e.type_echeance === 'audience').length || 0,
    delaisLegaux: echeances?.filter((e) => e.type_echeance === 'delai_legal').length || 0,
  }

  // Grouper par urgence
  const echeancesDepassees = echeances?.filter(
    (e) => new Date(e.date_echeance) < aujourdhui
  )
  const echeancesCritiques = echeances?.filter((e) => {
    const urgence = niveauUrgence(new Date(e.date_echeance))
    return urgence === 'critique' && new Date(e.date_echeance) >= aujourdhui
  })
  const echeancesUrgentes = echeances?.filter((e) => {
    const urgence = niveauUrgence(new Date(e.date_echeance))
    return urgence === 'urgent'
  })
  const echeancesProches = echeances?.filter((e) => {
    const urgence = niveauUrgence(new Date(e.date_echeance))
    return urgence === 'proche'
  })
  const echeancesNormales = echeances?.filter((e) => {
    const urgence = niveauUrgence(new Date(e.date_echeance))
    return urgence === 'normal'
  })

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
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('totalActive')}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{stats.total}</p>
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
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('overdueTitle')}</p>
              <p className="mt-1 text-2xl font-semibold text-red-600">{stats.depassees}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('immediateAction')}</p>
            </div>
            <div className="rounded-full bg-red-100 p-3">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('critical3Days')}</p>
              <p className="mt-1 text-2xl font-semibold text-orange-600">{stats.critiques}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('maxUrgency')}</p>
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
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="flex items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{t('urgent7Days')}</p>
              <p className="mt-1 text-2xl font-semibold text-yellow-600">{stats.urgentes}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('handleQuickly')}</p>
            </div>
            <div className="rounded-full bg-yellow-100 p-3">
              <svg
                className="h-6 w-6 text-yellow-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 rounded-lg border bg-card p-4">
        <span className="inline-flex items-center rounded-full bg-purple-100 px-3 py-1 text-sm font-medium text-purple-700">
          {t('hearings')} ({stats.audiences})
        </span>
        <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
          {t('legalDeadlines')} ({stats.delaisLegaux})
        </span>
      </div>

      {/* Liste des échéances */}
      {!echeances || echeances.length === 0 ? (
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
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-foreground">{t('noDeadlines')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('deadlinesWillAppear')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Dépassées */}
          {echeancesDepassees && echeancesDepassees.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-red-700">
                {t('overdueSection')} ({echeancesDepassees.length})
              </h2>
              <div className="grid gap-4">
                {echeancesDepassees.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
                ))}
              </div>
            </div>
          )}

          {/* Critiques */}
          {echeancesCritiques && echeancesCritiques.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-orange-700">
                {t('criticalSection')} ({echeancesCritiques.length})
              </h2>
              <div className="grid gap-4">
                {echeancesCritiques.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
                ))}
              </div>
            </div>
          )}

          {/* Urgentes */}
          {echeancesUrgentes && echeancesUrgentes.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-yellow-700">
                {t('urgentSection')} ({echeancesUrgentes.length})
              </h2>
              <div className="grid gap-4">
                {echeancesUrgentes.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
                ))}
              </div>
            </div>
          )}

          {/* Proches */}
          {echeancesProches && echeancesProches.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-blue-700">
                {t('upcomingSection')} ({echeancesProches.length})
              </h2>
              <div className="grid gap-4">
                {echeancesProches.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
                ))}
              </div>
            </div>
          )}

          {/* Normales */}
          {echeancesNormales && echeancesNormales.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                {t('futureSection')} ({echeancesNormales.length})
              </h2>
              <div className="grid gap-4">
                {echeancesNormales.map((echeance) => (
                  <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
