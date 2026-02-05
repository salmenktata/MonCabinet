import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { StatCard } from '@/components/dashboard/StatCard'
import { UrgentActions } from '@/components/dashboard/UrgentActions'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { QuickActions } from '@/components/dashboard/QuickActions'
import RevenusWidget from '@/components/dashboard/RevenusWidget'
import DossiersParWorkflowWidget from '@/components/dashboard/DossiersParWorkflowWidget'
import TimeTrackingWidget from '@/components/dashboard/TimeTrackingWidget'
import UnclassifiedDocumentsWidget from '@/components/dashboard/UnclassifiedDocumentsWidget'
import PendingDocumentsWidget from '@/components/dashboard/PendingDocumentsWidget'
import { Icons } from '@/lib/icons'
import { getTranslations, getLocale } from 'next-intl/server'

export default async function DashboardPage() {
  const t = await getTranslations('dashboard')
  const tStats = await getTranslations('stats')
  const tActivity = await getTranslations('activity')
  const tCurrency = await getTranslations('currency')
  const locale = await getLocale()
  const session = await getSession()

  if (!session?.user?.id) return null

  const userId = session.user.id

  // Récupérer toutes les données EN PARALLÈLE (optimisation performance)
  const [
    clientsResult,
    dossiersResult,
    facturesResult,
    documentsResult,
    echeancesResult,
    timeEntriesResult,
  ] = await Promise.all([
    query('SELECT id, nom, prenom, created_at FROM clients WHERE user_id = $1', [userId]),
    query('SELECT * FROM dossiers WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    query('SELECT * FROM factures WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
    query('SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10', [userId]),
    query(
      `SELECT e.id, e.titre, e.description, e.date_echeance, e.type, e.terminee, e.created_at,
        json_build_object('numero', d.numero, 'objet', d.objet) as dossier
      FROM echeances e
      LEFT JOIN dossiers d ON e.dossier_id = d.id
      WHERE e.user_id = $1
      ORDER BY e.date_echeance ASC
      LIMIT 20`,
      [userId]
    ),
    query('SELECT * FROM time_entries WHERE user_id = $1 ORDER BY date DESC', [userId]),
  ])

  const clients = clientsResult.rows
  const dossiers = dossiersResult.rows
  const factures = facturesResult.rows
  const documents = documentsResult.rows
  const echeances = echeancesResult.rows
  const timeEntries = timeEntriesResult.rows

  // Calculs côté JS (évite requêtes supplémentaires)
  const dossiersActifs = dossiers.filter((d) => d.statut === 'en_cours')
  const facturesImpayees = factures.filter((f) => f.statut === 'envoyee' || f.statut === 'brouillon')
  const montantImpaye = facturesImpayees.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)

  // Échéances critiques (7 prochains jours) - calculé côté JS
  const dans7Jours = new Date()
  dans7Jours.setDate(dans7Jours.getDate() + 7)
  const echeancesCritiques = echeances.filter((e) => {
    const dateEcheance = new Date(e.date_echeance)
    return dateEcheance <= dans7Jours && !e.terminee
  })

  // Time tracking ce mois
  const debutMois = new Date()
  debutMois.setDate(1)
  debutMois.setHours(0, 0, 0, 0)

  const timeEntriesCeMois = timeEntries?.filter((e) => {
    const dateEntree = new Date(e.date)
    return dateEntree >= debutMois
  }) || []

  const tempsTotal = timeEntriesCeMois.reduce((acc, e) => acc + (e.duree_minutes || 0), 0)
  const heuresTotal = Math.floor(tempsTotal / 60)

  // Calcul nouveaux clients ce mois
  const nouveauxClientsCeMois = clients?.filter((c) => {
    const dateCreation = new Date(c.created_at)
    return dateCreation >= debutMois
  })?.length || 0

  // Calcul nouveaux dossiers ce mois
  const nouveauxDossiersCeMois = dossiers?.filter((d) => {
    const dateCreation = new Date(d.created_at)
    return dateCreation >= debutMois
  })?.length || 0

  const stats = {
    clients: clients?.length || 0,
    dossiersActifs: dossiersActifs?.length || 0,
    echeancesCritiques: echeancesCritiques?.length || 0,
    montantImpaye: montantImpaye.toFixed(3),
    facturesImpayees: facturesImpayees.length,
    heuresCeMois: heuresTotal,
    nouveauxClientsCeMois,
    nouveauxDossiersCeMois,
  }

  // Préparer les activités récentes
  const activities = [
    ...(clients?.slice(0, 3).map((c) => ({
      id: `client-${c.id}`,
      type: 'client' as const,
      action: 'created' as const,
      title: `${c.prenom} ${c.nom}`,
      description: tActivity('newClient'),
      timestamp: c.created_at,
      href: `/clients/${c.id}`,
    })) || []),
    ...(dossiers?.slice(0, 3).map((d) => ({
      id: `dossier-${d.id}`,
      type: 'dossier' as const,
      action: 'created' as const,
      title: tActivity('dossierNumber', { number: d.numero }),
      description: d.objet,
      timestamp: d.created_at,
      href: `/dossiers/${d.id}`,
    })) || []),
    ...(factures?.slice(0, 2).map((f) => ({
      id: `facture-${f.id}`,
      type: 'facture' as const,
      action: f.statut === 'PAYEE' ? ('paid' as const) : ('created' as const),
      title: tActivity('invoiceNumber', { number: f.numero }),
      description: `${f.montant_ttc} ${tCurrency('tnd')}`,
      timestamp: f.created_at,
      href: `/factures/${f.id}`,
    })) || []),
    ...(documents?.slice(0, 2).map((d) => ({
      id: `document-${d.id}`,
      type: 'document' as const,
      action: 'created' as const,
      title: d.nom,
      description: tActivity('documentAdded'),
      timestamp: d.created_at,
      href: `/documents`,
    })) || []),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)

  // Obtenir la date actuelle
  const today = new Date()
  const dateFormatted = today.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Header avec salutation */}
      <div>
        <h1 className="text-3xl font-bold">
          {tStats('hello')}
        </h1>
        <p className="text-muted-foreground mt-1">
          {dateFormatted}
        </p>
      </div>

      {/* Statistiques principales - 4 cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('clients')}
          value={stats.clients}
          icon={Icons.clients}
          variant="primary"
          href="/clients"
          trend={{
            value: nouveauxClientsCeMois,
            label: tStats('newThisMonth', { count: nouveauxClientsCeMois }),
          }}
        />
        <StatCard
          title={t('activeDossiers')}
          value={stats.dossiersActifs}
          icon={Icons.dossiers}
          variant="success"
          href="/dossiers"
          trend={{
            value: nouveauxDossiersCeMois,
            label: tStats('newThisMonth', { count: nouveauxDossiersCeMois }),
          }}
        />
        <StatCard
          title={t('unpaid')}
          value={`${stats.montantImpaye} ${tCurrency('tnd')}`}
          subtitle={`${stats.facturesImpayees} ${t('invoices')}`}
          icon={Icons.dollar}
          variant="danger"
          href="/factures"
        />
        <StatCard
          title={t('deadlines7Days')}
          value={stats.echeancesCritiques}
          subtitle={tStats('urgent')}
          icon={Icons.alertCircle}
          variant="warning"
          href="/echeances"
        />
      </div>

      {/* Widget Documents à Classer */}
      <UnclassifiedDocumentsWidget
        dossiers={dossiers?.map((d) => ({
          id: d.id,
          numero: d.numero,
          objet: d.objet || '',
          client_id: d.client_id,
        })) || []}
      />

      {/* Widget Documents WhatsApp en Attente */}
      <PendingDocumentsWidget
        dossiers={dossiers?.map((d) => ({
          id: d.id,
          numero: d.numero,
          objet: d.objet || '',
          client_id: d.client_id,
        })) || []}
      />

      {/* Actions urgentes et Activité récente */}
      <div className="grid gap-6 lg:grid-cols-2">
        <UrgentActions echeances={echeances || []} />
        <RecentActivity activities={activities} />
      </div>

      {/* Widgets graphiques */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenusWidget factures={factures || []} />
        <DossiersParWorkflowWidget dossiers={dossiers || []} />
      </div>

      {/* Time tracking */}
      <TimeTrackingWidget timeEntries={timeEntries || []} />

      {/* Actions rapides */}
      <QuickActions />
    </div>
  )
}
