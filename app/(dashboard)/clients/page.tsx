import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import Link from 'next/link'
import ClientCard from '@/components/clients/ClientCard'
import { getTranslations } from 'next-intl/server'

export default async function ClientsPage() {
  const t = await getTranslations('clients')
  const session = await getSession()

  if (!session?.user?.id) return null

  // Récupérer tous les clients
  const result = await query(
    'SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at DESC',
    [session.user.id]
  )
  const clients = result.rows

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
            {clients?.length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('naturalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {clients?.filter((c) => c.type === 'PERSONNE_PHYSIQUE').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('legalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {clients?.filter((c) => c.type === 'PERSONNE_MORALE').length || 0}
          </div>
        </div>
      </div>

      {/* Liste des clients */}
      {clients && clients.length > 0 ? (
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
