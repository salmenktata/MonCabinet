import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import FactureForm from '@/components/factures/FactureForm'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

export default async function EditFacturePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  const t = await getTranslations('factures')

  if (!session?.user?.id) {
    redirect('/login')
  }

  const factureResult = await query(
    'SELECT * FROM factures WHERE id = $1 AND user_id = $2',
    [id, session.user.id]
  )
  const facture = factureResult.rows[0]

  if (!facture) {
    notFound()
  }

  const clientsResult = await query(
    'SELECT id, type_client, nom, prenom FROM clients WHERE user_id = $1 ORDER BY nom ASC',
    [session.user.id]
  )
  const clients = clientsResult.rows

  const dossiersResult = await query(
    'SELECT id, numero, objet, client_id FROM dossiers WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.id]
  )
  const dossiers = dossiersResult.rows

  const initialData = {
    client_id: facture.client_id,
    dossier_id: facture.dossier_id || '',
    montant_ht: facture.montant_ht,
    taux_tva: facture.taux_tva,
    date_emission: facture.date_emission,
    date_echeance: facture.date_echeance || '',
    statut: facture.statut,
    objet: facture.objet,
    notes: facture.notes || '',
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête */}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground mb-2" asChild>
          <Link href={`/factures/${id}`}>
            <Icons.chevronLeft className="mr-1 h-4 w-4" />
            {t('backToInvoice')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">
          {t('editInvoice')} {facture.numero}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('editInvoiceInfo')}</p>
      </div>

      {/* Formulaire */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <FactureForm
          factureId={id}
          initialData={initialData}
          isEditing={true}
          clients={clients || []}
          dossiers={dossiers || []}
        />
      </div>
    </div>
  )
}
