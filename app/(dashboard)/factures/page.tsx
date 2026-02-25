import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { StatCard } from '@/components/dashboard/StatCard'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import FacturesListClient from '@/components/factures/FacturesListClient'

export default async function FacturesPage() {
  const t = await getTranslations('factures')
  const session = await getSession()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const result = await query(
    `SELECT f.*,
      json_build_object(
        'id', c.id,
        'type_client', c.type_client,
        'nom', c.nom,
        'prenom', c.prenom,
        'email', c.email
      ) as clients,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet
      ) as dossiers
    FROM factures f
    LEFT JOIN clients c ON f.client_id = c.id
    LEFT JOIN dossiers d ON f.dossier_id = d.id
    WHERE f.user_id = $1
    ORDER BY f.date_emission DESC`,
    [session.user.id]
  )
  const factures = result.rows

  const stats = {
    total: factures?.length || 0,
    brouillon: factures?.filter((f) => f.statut === 'brouillon').length || 0,
    envoyees: factures?.filter((f) => f.statut === 'envoyee').length || 0,
    payees: factures?.filter((f) => f.statut === 'payee').length || 0,
    impayees: factures?.filter((f) => f.statut === 'impayee').length || 0,
    montantTotal: factures?.reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
    montantPaye:
      factures
        ?.filter((f) => f.statut === 'payee')
        .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
    montantImpaye:
      factures
        ?.filter((f) => f.statut === 'impayee' || f.statut === 'envoyee')
        .reduce((acc, f) => acc + parseFloat(f.montant_ttc || 0), 0) || 0,
  }

  const facturesEnRetard =
    factures?.filter(
      (f) =>
        (f.statut === 'envoyee' || f.statut === 'impayee') &&
        f.date_echeance &&
        new Date(f.date_echeance) < new Date()
    ).length || 0

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/factures/new">
            <Icons.add className="mr-1.5 h-4 w-4" />
            {t('newInvoice')}
          </Link>
        </Button>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Icons.invoices}
          variant="primary"
          title={t('totalInvoices')}
          value={stats.total}
          subtitle={`${stats.brouillon} brouillon · ${stats.envoyees} envoyée${stats.envoyees !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={Icons.banknote}
          variant="default"
          title={t('totalAmountTTC')}
          value={`${stats.montantTotal.toFixed(3)} TND`}
        />
        <StatCard
          icon={Icons.checkCircle}
          variant="success"
          title={t('paid')}
          value={`${stats.montantPaye.toFixed(3)} TND`}
          subtitle={`${stats.payees} facture${stats.payees !== 1 ? 's' : ''}`}
        />
        <StatCard
          icon={Icons.alertCircle}
          variant="danger"
          title={t('unpaid')}
          value={`${stats.montantImpaye.toFixed(3)} TND`}
          subtitle={
            facturesEnRetard > 0
              ? `${facturesEnRetard} en retard`
              : `${stats.impayees} facture${stats.impayees !== 1 ? 's' : ''}`
          }
        />
      </div>

      {/* Liste interactive */}
      <FacturesListClient factures={factures} />
    </div>
  )
}
