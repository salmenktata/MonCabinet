import { query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import Link from 'next/link'
import DossierCard from '@/components/dossiers/DossierCard'
import { getTranslations } from 'next-intl/server'

export default async function DossiersPage() {
  const t = await getTranslations('dossiers')
  const session = await getSession()

  if (!session?.user?.id) return null

  // Récupérer tous les dossiers avec les clients
  const result = await query(
    `SELECT d.*,
      json_build_object(
        'id', c.id,
        'type_client', c.type_client,
        'nom', c.nom,
        'prenom', c.prenom,
        'email', c.email,
        'telephone', c.telephone,
        'adresse', c.adresse,
        'cin', c.cin,
        'notes', c.notes,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'user_id', c.user_id
      ) as clients
    FROM dossiers d
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.user_id = $1
    ORDER BY d.created_at DESC`,
    [session.user.id]
  )
  const dossiers = result.rows

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dossiers/assistant"
            className="flex items-center gap-2 rounded-md border-2 border-blue-600 bg-blue-50 px-4 py-2 text-blue-700 font-semibold hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <span>&#129302;</span>
            Nouveau avec IA
          </Link>
          <Link
            href="/dossiers/new"
            className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            + {t('newDossier')}
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('totalDossiers')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {dossiers?.length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('activeDossiers')}
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">
            {dossiers?.filter((d) => d.statut === 'en_cours').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('closedDossiers')}
          </div>
          <div className="mt-2 text-3xl font-bold text-muted-foreground">
            {dossiers?.filter((d) => d.statut === 'clos').length || 0}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('civilProcedures')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {dossiers?.filter((d) => d.type_procedure === 'civil').length || 0}
          </div>
        </div>
      </div>

      {/* Liste des dossiers */}
      {dossiers && dossiers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dossiers.map((dossier) => (
            <DossierCard key={dossier.id} dossier={dossier} />
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-foreground">
            {t('noDossiers')}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('createFirstDossier')}
          </p>
          <div className="mt-6">
            <Link
              href="/dossiers/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              + {t('newDossier')}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
