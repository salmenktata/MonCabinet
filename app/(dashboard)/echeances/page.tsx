import Link from 'next/link'
import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { niveauUrgence } from '@/lib/utils/delais-tunisie'
import { getTranslations } from 'next-intl/server'
import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import EcheancesListClient from '@/components/echeances/EcheancesListClient'

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
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/dossiers">
            <Icons.add className="mr-1.5 h-4 w-4" />
            {t('newDeadline')}
          </Link>
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Icons.deadlines}
          variant="primary"
          title={t('totalActive')}
          value={stats.total}
        />
        <StatCard
          icon={Icons.alertCircle}
          variant="danger"
          title={t('overdueTitle')}
          value={stats.depassees}
          subtitle={t('immediateAction')}
        />
        <StatCard
          icon={Icons.clock}
          variant="warning"
          title={t('critical3Days')}
          value={stats.critiques}
          subtitle={t('maxUrgency')}
        />
        <StatCard
          icon={Icons.bell}
          variant="default"
          title={t('urgent7Days')}
          value={stats.urgentes}
          subtitle={t('handleQuickly')}
        />
      </div>

      {/* Liste interactive (filtres + recherche + groupement) */}
      <EcheancesListClient echeances={echeances} />
    </div>
  )
}
