import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getActiveTimerAction } from '@/app/actions/time-entries'
import ActiveTimer from '@/components/time-tracking/ActiveTimer'
import TimeEntriesListClient from '@/components/time-tracking/TimeEntriesListClient'
import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

export default async function TimeTrackingPage() {
  const session = await getSession()
  const t = await getTranslations('timeTracking')

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Timer actif
  const timerResult = await getActiveTimerAction()
  const activeTimer = timerResult.success ? timerResult.data : null

  // Récupérer les entrées de temps
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
    ORDER BY te.date DESC, te.created_at DESC
    LIMIT 100`,
    [session.user.id]
  )
  const timeEntries = timeEntriesResult.rows

  // Statistiques
  const aujourd_hui = new Date()
  const debutSemaine = new Date(aujourd_hui)
  debutSemaine.setDate(aujourd_hui.getDate() - aujourd_hui.getDay())
  debutSemaine.setHours(0, 0, 0, 0)
  const debutMois = new Date(aujourd_hui.getFullYear(), aujourd_hui.getMonth(), 1)

  const entriesSemaine = timeEntries.filter((e) => new Date(e.date) >= debutSemaine)
  const entriesMois = timeEntries.filter((e) => new Date(e.date) >= debutMois)

  const stats = {
    heuresSemaine: entriesSemaine.reduce((acc, e) => acc + (e.duree_minutes || 0), 0) / 60,
    heuresMois: entriesMois.reduce((acc, e) => acc + (e.duree_minutes || 0), 0) / 60,
    montantMois: entriesMois
      .filter((e) => e.facturable)
      .reduce((acc, e) => acc + parseFloat(e.montant_calcule || '0'), 0),
    nonFacturees: timeEntries.filter((e) => e.facturable && !e.facture_id).length,
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/time-tracking/new">
            <Icons.add className="mr-1.5 h-4 w-4" />
            {t('newEntry')}
          </Link>
        </Button>
      </div>

      {/* Timer actif */}
      {activeTimer && <ActiveTimer timer={activeTimer} />}

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Icons.clock}
          variant="primary"
          title={t('hoursThisWeek')}
          value={`${stats.heuresSemaine.toFixed(1)}h`}
        />
        <StatCard
          icon={Icons.calendar}
          variant="default"
          title={t('hoursThisMonth')}
          value={`${stats.heuresMois.toFixed(1)}h`}
        />
        <StatCard
          icon={Icons.banknote}
          variant="success"
          title={t('billableThisMonth')}
          value={`${stats.montantMois.toFixed(0)} TND`}
        />
        <StatCard
          icon={Icons.listTodo}
          variant="warning"
          title={t('notBilled')}
          value={stats.nonFacturees}
          subtitle={t('pendingEntries')}
        />
      </div>

      {/* Liste interactive */}
      <TimeEntriesListClient entries={timeEntries} />
    </div>
  )
}
