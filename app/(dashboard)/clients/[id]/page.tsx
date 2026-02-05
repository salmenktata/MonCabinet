import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import ClientForm from '@/components/clients/ClientForm'
import { getTranslations } from 'next-intl/server'

interface ClientDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params
  const session = await getSession()
  const t = await getTranslations('clients')

  if (!session?.user?.id) return null

  // Récupérer toutes les données EN PARALLÈLE (optimisation performance)
  const [clientResult, dossiersResult] = await Promise.all([
    query('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [id, session.user.id]),
    query('SELECT * FROM dossiers WHERE client_id = $1 AND user_id = $2 ORDER BY created_at DESC', [id, session.user.id]),
  ])

  const client = clientResult.rows[0]
  const dossiers = dossiersResult.rows

  if (!client) {
    notFound()
  }

  const displayName =
    client.type_client === 'personne_physique'
      ? `${client.nom} ${client.prenom || ''}`.trim()
      : client.nom

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/clients"
              className="text-muted-foreground hover:text-foreground"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Link>
            <h1 className="text-3xl font-bold text-foreground">{displayName}</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            {t('clientInfo')}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Informations */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {t('editInfo')}
            </h2>
            <ClientForm initialData={client} isEditing />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Statistiques */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t('statistics')}
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('activeDossiersCount')}</span>
                <span className="text-lg font-bold text-blue-600">
                  {dossiers?.filter((d) => d.statut === 'en_cours').length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('closedDossiersCount')}</span>
                <span className="text-lg font-bold text-muted-foreground">
                  {dossiers?.filter((d) => d.statut === 'clos').length || 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('totalDossiersCount')}</span>
                <span className="text-lg font-bold text-foreground">
                  {dossiers?.length || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Dossiers récents */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t('recentDossiers')}
            </h3>
            {dossiers && dossiers.length > 0 ? (
              <div className="space-y-3">
                {dossiers.slice(0, 5).map((dossier) => (
                  <Link
                    key={dossier.id}
                    href={`/dossiers/${dossier.id}`}
                    className="block rounded-md border border p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        {dossier.numero}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                          dossier.statut === 'en_cours'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        {dossier.statut}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {dossier.objet}
                    </p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noDossiers')}</p>
            )}
          </div>

          {/* Actions rapides */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t('quickActions')}
            </h3>
            <div className="space-y-2">
              <Link
                href={`/dossiers/new?client_id=${client.id}`}
                className="block w-full rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-semibold text-white hover:bg-blue-700"
              >
                {t('createDossier')}
              </Link>
              <Link
                href={`/factures/new?client_id=${client.id}`}
                className="block w-full rounded-md border border bg-card px-4 py-2 text-center text-sm font-semibold text-foreground hover:bg-muted"
              >
                {t('createInvoice')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
