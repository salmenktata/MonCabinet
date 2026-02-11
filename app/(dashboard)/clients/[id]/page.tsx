'use client'

import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useClient } from '@/lib/hooks/useClients'
import ClientForm from '@/components/clients/ClientForm'

export default function ClientDetailPage() {
  const params = useParams()
  const id = params?.id as string
  const t = useTranslations('clients')

  const { data: client, isLoading, error } = useClient(id, {
    enabled: !!id,
  })

  // Gestion erreur
  if (error) {
    if (error.message.includes('404') || error.message.includes('non trouvé')) {
      notFound()
    }

    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Erreur lors du chargement du client: {error.message}
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-8 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-96 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Chargement du client...</span>
          </div>
        </div>
      </div>
    )
  }

  // Pas de client
  if (!client) {
    notFound()
  }

  const dossiers = client.dossiers || []

  const displayName =
    client.typeClient === 'particulier' || client.typeClient === 'personne_physique'
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
                  {dossiers.filter((d: any) => d.statut === 'en_cours').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('closedDossiersCount')}</span>
                <span className="text-lg font-bold text-muted-foreground">
                  {dossiers.filter((d: any) => d.statut === 'clos').length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t('totalDossiersCount')}</span>
                <span className="text-lg font-bold text-foreground">
                  {dossiers.length}
                </span>
              </div>
            </div>
          </div>

          {/* Dossiers récents */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              {t('recentDossiers')}
            </h3>
            {dossiers.length > 0 ? (
              <div className="space-y-3">
                {dossiers.slice(0, 5).map((dossier: any) => (
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
