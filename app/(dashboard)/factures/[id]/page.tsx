import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FactureDetailClient from '@/components/factures/FactureDetailClient'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  const t = await getTranslations('factures')
  const tClients = await getTranslations('clients')

  if (!session?.user?.id) {
    redirect('/login')
  }

  const factureResult = await query(
    `SELECT f.*,
      json_build_object(
        'id', c.id,
        'type_client', c.type_client,
        'nom', c.nom,
        'prenom', c.prenom,
        'email', c.email,
        'telephone', c.telephone,
        'adresse', c.adresse,
        'cin', c.cin
      ) as clients,
      json_build_object(
        'id', d.id,
        'numero', d.numero,
        'objet', d.objet,
        'type_dossier', d.type_dossier
      ) as dossiers
    FROM factures f
    LEFT JOIN clients c ON f.client_id = c.id
    LEFT JOIN dossiers d ON f.dossier_id = d.id
    WHERE f.id = $1 AND f.user_id = $2`,
    [id, session.user.id]
  )
  const facture = factureResult.rows[0]

  if (!facture) {
    notFound()
  }

  const clientName = facture.clients
    ? facture.clients.type_client === 'personne_physique'
      ? `${facture.clients.nom} ${facture.clients.prenom || ''}`.trim()
      : facture.clients.nom
    : t('clientDeleted')

  const isRetard =
    (facture.statut === 'envoyee' || facture.statut === 'impayee') &&
    facture.date_echeance &&
    new Date(facture.date_echeance) < new Date()

  const statutConfig: Record<string, { label: string; className: string }> = {
    brouillon: { label: t('draft'), className: 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400' },
    envoyee: { label: t('sent'), className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
    payee: { label: t('paid'), className: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
    impayee: { label: t('unpaid'), className: 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
  }
  const statut = statutConfig[facture.statut] ?? { label: facture.statut, className: '' }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 -ml-2 h-8 text-muted-foreground" asChild>
            <Link href="/factures">
              <Icons.chevronLeft className="mr-1 h-4 w-4" />
              {t('backToInvoices')}
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground">
            {t('invoice')} {facture.numero}
          </h1>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Badge variant="secondary" className={cn(statut.className)}>
            {statut.label}
          </Badge>
          {isRetard && (
            <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400">
              <Icons.alertCircle className="mr-1 h-3 w-3" />
              {t('lateWarning')}
            </Badge>
          )}
        </div>
      </div>

      {/* Contenu principal */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="lg:col-span-2 space-y-6">
          {/* Informations de la facture */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              {t('invoiceInfo')}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">{t('number')}</p>
                  <p className="font-medium text-foreground mt-0.5">{facture.numero}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('issueDate')}</p>
                  <p className="font-medium text-foreground mt-0.5">
                    {new Date(facture.date_emission).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              {(facture.date_echeance || facture.date_paiement) && (
                <div className="grid grid-cols-2 gap-4">
                  {facture.date_echeance && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('dueDate')}</p>
                      <p className={cn('font-medium mt-0.5', isRetard ? 'text-red-600' : 'text-foreground')}>
                        {new Date(facture.date_echeance).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                  {facture.date_paiement && (
                    <div>
                      <p className="text-xs text-muted-foreground">{t('paymentDate')}</p>
                      <p className="font-medium text-green-600 mt-0.5">
                        {new Date(facture.date_paiement).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs text-muted-foreground">{t('object')}</p>
                <p className="font-medium text-foreground mt-0.5">{facture.objet}</p>
              </div>

              {facture.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">{tClients('notes')}</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap mt-0.5">{facture.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Montants */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              {t('amounts')}
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between text-foreground">
                <span className="text-sm text-muted-foreground">{t('amountHT')}</span>
                <span className="font-medium tabular-nums">
                  {parseFloat(facture.montant_ht).toFixed(3)} TND
                </span>
              </div>
              <div className="flex justify-between text-foreground">
                <span className="text-sm text-muted-foreground">
                  {t('tva')} ({facture.taux_tva}%)
                </span>
                <span className="font-medium tabular-nums">
                  {parseFloat(facture.montant_tva).toFixed(3)} TND
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between items-baseline">
                <span className="font-semibold text-foreground">{t('amountTTC')}</span>
                <span className="text-2xl font-bold text-primary tabular-nums">
                  {parseFloat(facture.montant_ttc).toFixed(3)} TND
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-6">
          {/* Informations client */}
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
              {tClients('client')}
            </h2>
            {facture.clients ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {facture.clients.type_client === 'personne_physique' ? (
                    <Icons.user className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <Icons.building className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="font-medium text-foreground">{clientName}</span>
                </div>
                {facture.clients.email && (
                  <a
                    href={`mailto:${facture.clients.email}`}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                  >
                    <Icons.mail className="h-3.5 w-3.5 shrink-0" />
                    {facture.clients.email}
                  </a>
                )}
                {facture.clients.telephone && (
                  <a
                    href={`tel:${facture.clients.telephone}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Icons.phone className="h-3.5 w-3.5 shrink-0" />
                    {facture.clients.telephone}
                  </a>
                )}
                {facture.clients.adresse && (
                  <p className="text-sm text-muted-foreground">{facture.clients.adresse}</p>
                )}
                <div className="pt-2 border-t">
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-0 text-blue-600 hover:text-blue-700" asChild>
                    <Link href={`/clients/${facture.clients.id}`}>
                      {t('viewClientFile')}
                      <Icons.chevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('clientDeleted')}</p>
            )}
          </div>

          {/* Dossier lié */}
          {facture.dossiers?.id && (
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                {t('linkedDossier')}
              </h2>
              <div className="space-y-2">
                <p className="font-medium text-foreground">{facture.dossiers.numero}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">{facture.dossiers.objet}</p>
                <div className="pt-2 border-t">
                  <Button variant="ghost" size="sm" className="h-7 text-xs px-0 text-blue-600 hover:text-blue-700" asChild>
                    <Link href={`/dossiers/${facture.dossiers.id}`}>
                      {t('viewDossier')}
                      <Icons.chevronRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <FactureDetailClient facture={facture} />
        </div>
      </div>
    </div>
  )
}
