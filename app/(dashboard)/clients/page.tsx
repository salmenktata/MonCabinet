'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useClientList } from '@/lib/hooks/useClients'
import ClientCard from '@/components/clients/ClientCard'

export default function ClientsPage() {
  const t = useTranslations('clients')

  const { data, isLoading, error } = useClientList({
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })

  const clients = data?.clients || []

  // Gestion erreur
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Erreur lors du chargement des clients: {error.message}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <Link
          href="/clients/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + {t('newClient')}
        </Link>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('totalClients')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading ? '...' : clients.length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('naturalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading
              ? '...'
              : clients.filter((c) =>
                  c.typeClient === 'particulier' ||
                  c.typeClient === 'PERSONNE_PHYSIQUE'
                ).length
            }
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('legalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading
              ? '...'
              : clients.filter((c) =>
                  c.typeClient === 'entreprise' ||
                  c.typeClient === 'PERSONNE_MORALE'
                ).length
            }
          </div>
        </div>
      </div>

      {/* Liste des clients */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Chargement des clients...</span>
          </div>
        </div>
      ) : clients && clients.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <p className="mt-2 text-sm font-medium text-foreground">{t('noClients')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstClient')}
          </p>
          <div className="mt-6">
            <Link
              href="/clients/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + {t('newClient')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
