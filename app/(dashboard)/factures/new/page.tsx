import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FactureForm from '@/components/factures/FactureForm'
import { getTranslations } from 'next-intl/server'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'

export default async function NewFacturePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; dossier_id?: string }>
}) {
  const params = await searchParams
  const session = await getSession()
  const t = await getTranslations('factures')

  if (!session?.user?.id) {
    redirect('/login')
  }

  const clientsResult = await query(
    'SELECT id, type_client, nom, prenom FROM clients WHERE user_id = $1 ORDER BY nom ASC',
    [session.user.id]
  )
  const clients = clientsResult.rows

  const dossiersResult = await query(
    'SELECT id, numero, objet, client_id FROM dossiers WHERE user_id = $1 AND statut = $2 ORDER BY created_at DESC',
    [session.user.id, 'en_cours']
  )
  const dossiers = dossiersResult.rows

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* En-tête */}
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 h-8 text-muted-foreground mb-2" asChild>
          <Link href="/factures">
            <Icons.chevronLeft className="mr-1 h-4 w-4" />
            {t('backToInvoices')}
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{t('newInvoice')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('createInvoice')}</p>
      </div>

      {/* Formulaire */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">
        {!clients || clients.length === 0 ? (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 p-4">
            <div className="flex gap-3">
              <Icons.alertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                  {t('noClientFound')}
                </p>
                <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
                  {t('createClientFirst')}
                </p>
                <Button variant="link" size="sm" className="mt-2 h-auto p-0 text-yellow-800 dark:text-yellow-300 underline" asChild>
                  <Link href="/clients/new">
                    {t('createClient')}
                    <Icons.chevronRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <FactureForm
            clients={clients || []}
            dossiers={dossiers || []}
            preselectedClientId={params.client_id}
            preselectedDossierId={params.dossier_id}
          />
        )}
      </div>
    </div>
  )
}
