import { Suspense } from 'react'
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { StatCard } from '@/components/dashboard/StatCard'
import { UrgentActions } from '@/components/dashboard/UrgentActions'
import { RecentActivity } from '@/components/dashboard/RecentActivity'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { Icons } from '@/lib/icons'
import { getTranslations, getLocale } from 'next-intl/server'
import dynamic from 'next/dynamic'
import {
  StatsGridSkeleton,
  WidgetSkeleton,
  ChartWidgetSkeleton,
  ActivitySkeleton,
  TimeTrackingSkeleton,
} from '@/components/dashboard/DashboardSkeletons'

// Dynamic imports pour les widgets lourds (chargés après le contenu principal)
const RevenusWidget = dynamic(
  () => import('@/components/dashboard/RevenusWidget'),
  { loading: () => <ChartWidgetSkeleton /> }
)
const DossiersParWorkflowWidget = dynamic(
  () => import('@/components/dashboard/DossiersParWorkflowWidget'),
  { loading: () => <ChartWidgetSkeleton /> }
)
const TimeTrackingWidget = dynamic(
  () => import('@/components/dashboard/TimeTrackingWidget'),
  { loading: () => <TimeTrackingSkeleton /> }
)
const UnclassifiedDocumentsWidget = dynamic(
  () => import('@/components/dashboard/UnclassifiedDocumentsWidget'),
  { loading: () => <WidgetSkeleton /> }
)
const PendingDocumentsWidget = dynamic(
  () => import('@/components/dashboard/PendingDocumentsWidget'),
  { loading: () => <WidgetSkeleton /> }
)

// Composant pour les stats principales (rendu en premier)
async function DashboardStats({ userId }: { userId: string }) {
  const t = await getTranslations('dashboard')
  const tStats = await getTranslations('stats')
  const tCurrency = await getTranslations('currency')

  // Requêtes optimisées - seulement les champs nécessaires
  const [clientsResult, dossiersResult, facturesResult, echeancesResult] = await Promise.all([
    query('SELECT id, created_at FROM clients WHERE user_id = $1', [userId]),
    query('SELECT id, statut, created_at FROM dossiers WHERE user_id = $1', [userId]),
    query('SELECT id, statut, montant_ttc FROM factures WHERE user_id = $1', [userId]),
    query(
      `SELECT id, date_echeance, terminee FROM echeances
       WHERE user_id = $1 AND statut = 'actif'
       ORDER BY date_echeance ASC LIMIT 50`,
      [userId]
    ),
  ])

  const clients = clientsResult.rows
  const dossiers = dossiersResult.rows
  const factures = facturesResult.rows
  const echeances = echeancesResult.rows

  // Calculs
  const debutMois = new Date()
  debutMois.setDate(1)
  debutMois.setHours(0, 0, 0, 0)

  const dossiersActifs = dossiers.filter((d) => d.statut === 'en_cours')
  const facturesImpayees = factures.filter((f) => f.statut === 'envoyee' || f.statut === 'brouillon')
  const montantImpaye = facturesImpayees.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0)

  const dans7Jours = new Date()
  dans7Jours.setDate(dans7Jours.getDate() + 7)
  const echeancesCritiques = echeances.filter((e) => {
    const dateEcheance = new Date(e.date_echeance)
    return dateEcheance <= dans7Jours && !e.terminee
  })

  const nouveauxClientsCeMois = clients.filter((c) => new Date(c.created_at) >= debutMois).length
  const nouveauxDossiersCeMois = dossiers.filter((d) => new Date(d.created_at) >= debutMois).length

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title={t('clients')}
        value={clients.length}
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
        value={dossiersActifs.length}
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
        value={`${montantImpaye.toFixed(3)} ${tCurrency('tnd')}`}
        subtitle={`${facturesImpayees.length} ${t('invoices')}`}
        icon={Icons.dollar}
        variant="danger"
        href="/factures"
      />
      <StatCard
        title={t('deadlines7Days')}
        value={echeancesCritiques.length}
        subtitle={tStats('urgent')}
        icon={Icons.alertCircle}
        variant="warning"
        href="/echeances"
      />
    </div>
  )
}

// Composant pour les actions urgentes et activités récentes
async function DashboardActivity({ userId }: { userId: string }) {
  const tActivity = await getTranslations('activity')
  const tCurrency = await getTranslations('currency')

  const [clientsResult, dossiersResult, facturesResult, documentsResult, echeancesResult] =
    await Promise.all([
      query('SELECT id, nom, prenom, created_at FROM clients WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3', [userId]),
      query('SELECT id, numero, objet, created_at FROM dossiers WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3', [userId]),
      query('SELECT id, numero, statut, montant_ttc, created_at FROM factures WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2', [userId]),
      query('SELECT id, nom, created_at FROM documents WHERE user_id = $1 ORDER BY created_at DESC LIMIT 2', [userId]),
      query(
        `SELECT e.id, e.titre, e.description, e.date_echeance, e.type, e.terminee,
          json_build_object('numero', d.numero, 'objet', d.objet) as dossier
        FROM echeances e
        LEFT JOIN dossiers d ON e.dossier_id = d.id
        WHERE e.user_id = $1 AND e.statut = 'actif'
        ORDER BY e.date_echeance ASC LIMIT 20`,
        [userId]
      ),
    ])

  const activities = [
    ...clientsResult.rows.map((c) => ({
      id: `client-${c.id}`,
      type: 'client' as const,
      action: 'created' as const,
      title: `${c.prenom} ${c.nom}`,
      description: tActivity('newClient'),
      timestamp: c.created_at,
      href: `/clients/${c.id}`,
    })),
    ...dossiersResult.rows.map((d) => ({
      id: `dossier-${d.id}`,
      type: 'dossier' as const,
      action: 'created' as const,
      title: tActivity('dossierNumber', { number: d.numero }),
      description: d.objet,
      timestamp: d.created_at,
      href: `/dossiers/${d.id}`,
    })),
    ...facturesResult.rows.map((f) => ({
      id: `facture-${f.id}`,
      type: 'facture' as const,
      action: f.statut === 'PAYEE' ? ('paid' as const) : ('created' as const),
      title: tActivity('invoiceNumber', { number: f.numero }),
      description: `${f.montant_ttc} ${tCurrency('tnd')}`,
      timestamp: f.created_at,
      href: `/factures/${f.id}`,
    })),
    ...documentsResult.rows.map((d) => ({
      id: `document-${d.id}`,
      type: 'document' as const,
      action: 'created' as const,
      title: d.nom,
      description: tActivity('documentAdded'),
      timestamp: d.created_at,
      href: `/documents`,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <UrgentActions echeances={echeancesResult.rows} />
      <RecentActivity activities={activities} />
    </div>
  )
}

// Composant pour les widgets graphiques
async function DashboardCharts({ userId }: { userId: string }) {
  const [facturesResult, dossiersResult] = await Promise.all([
    query('SELECT id, statut, montant_ttc, date_emission FROM factures WHERE user_id = $1', [userId]),
    query('SELECT id, statut, type_procedure FROM dossiers WHERE user_id = $1', [userId]),
  ])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <RevenusWidget factures={facturesResult.rows} />
      <DossiersParWorkflowWidget dossiers={dossiersResult.rows} />
    </div>
  )
}

// Composant pour le time tracking
async function DashboardTimeTracking({ userId }: { userId: string }) {
  const result = await query(
    'SELECT id, duree_minutes, date, description FROM time_entries WHERE user_id = $1 ORDER BY date DESC LIMIT 100',
    [userId]
  )
  return <TimeTrackingWidget timeEntries={result.rows} />
}

// Composant pour les documents widgets
async function DashboardDocumentsWidgets({ userId }: { userId: string }) {
  const result = await query(
    'SELECT id, numero, objet, client_id FROM dossiers WHERE user_id = $1',
    [userId]
  )
  const dossiers = result.rows.map((d) => ({
    id: d.id,
    numero: d.numero,
    objet: d.objet || '',
    client_id: d.client_id,
  }))

  return (
    <>
      <UnclassifiedDocumentsWidget dossiers={dossiers} />
      <PendingDocumentsWidget dossiers={dossiers} />
    </>
  )
}

export default async function DashboardPage() {
  const tStats = await getTranslations('stats')
  const locale = await getLocale()
  const session = await getSession()

  if (!session?.user?.id) return null

  const userId = session.user.id

  // Date formatée (rendu immédiat)
  const today = new Date()
  const dateFormatted = today.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Header - rendu immédiat */}
      <div>
        <h1 className="text-3xl font-bold">{tStats('hello')}</h1>
        <p className="text-muted-foreground mt-1">{dateFormatted}</p>
      </div>

      {/* Stats principales - priorité haute */}
      <Suspense fallback={<StatsGridSkeleton />}>
        <DashboardStats userId={userId} />
      </Suspense>

      {/* Documents widgets - priorité moyenne */}
      <Suspense fallback={<WidgetSkeleton />}>
        <DashboardDocumentsWidgets userId={userId} />
      </Suspense>

      {/* Actions et activités - priorité moyenne */}
      <Suspense fallback={<div className="grid gap-6 lg:grid-cols-2"><ActivitySkeleton /><ActivitySkeleton /></div>}>
        <DashboardActivity userId={userId} />
      </Suspense>

      {/* Graphiques - priorité basse */}
      <Suspense fallback={<div className="grid gap-6 lg:grid-cols-2"><ChartWidgetSkeleton /><ChartWidgetSkeleton /></div>}>
        <DashboardCharts userId={userId} />
      </Suspense>

      {/* Time tracking - priorité basse */}
      <Suspense fallback={<TimeTrackingSkeleton />}>
        <DashboardTimeTracking userId={userId} />
      </Suspense>

      {/* Actions rapides - rendu immédiat (pas de données) */}
      <QuickActions />
    </div>
  )
}
