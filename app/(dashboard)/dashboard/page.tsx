import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // Récupérer toutes les données
  const { data: clients } = await supabase
    .from('clients')
    .select('id, nom, prenom, created_at')
    .eq('user_id', user.id)

  const { data: dossiers } = await supabase
    .from('dossiers')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: dossiersActifs } = await supabase
    .from('dossiers')
    .select('id')
    .eq('user_id', user.id)
    .eq('statut', 'ACTIF')

  const { data: factures } = await supabase
    .from('factures')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const { data: echeances } = await supabase
    .from('echeances')
    .select('*, dossiers(numero, objet)')
    .eq('user_id', user.id)
    .order('date_echeance', { ascending: true })
    .limit(20)

  const { data: timeEntries } = await supabase
    .from('time_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  // Calculs des statistiques
  const facturesImpayees = factures?.filter((f) => f.statut === 'IMPAYEE') || []
  const montantImpaye = facturesImpayees.reduce(
    (acc, f) => acc + parseFloat(f.montant_ttc || 0),
    0
  )

  // Échéances critiques (7 prochains jours)
  const dans7Jours = new Date()
  dans7Jours.setDate(dans7Jours.getDate() + 7)

  const { data: echeancesCritiques } = await supabase
    .from('echeances')
    .select('id')
    .eq('user_id', user.id)
    .lte('date_echeance', dans7Jours.toISOString().split('T')[0])

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
          numero_dossier: d.numero,
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
