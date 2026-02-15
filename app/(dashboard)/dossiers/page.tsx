'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useDossierList } from '@/lib/hooks/useDossiers'
import DossierCard from '@/components/dossiers/DossierCard'

export default function DossiersPage() {
  const t = useTranslations('dossiers')

  const { data, isLoading, error } = useDossierList({
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })

  const dossiers = data?.dossiers || []

  // États de chargement et d'erreur
  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Erreur lors du chargement des dossiers: {error.message}
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

        <div className="flex items-center gap-3">
          <Link
            href="/qadhya-ia/structure"
            className="flex items-center gap-2 rounded-md border-2 border-blue-600 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 text-blue-700 dark:text-blue-300 font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            <span>&#129302;</span>
            {t('newWithAI')}
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
            {isLoading ? '...' : dossiers.length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('activeDossiers')}
          </div>
          <div className="mt-2 text-3xl font-bold text-green-600">
            {isLoading ? '...' : dossiers.filter((d) => d.status === 'in_progress').length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('closedDossiers')}
          </div>
          <div className="mt-2 text-3xl font-bold text-muted-foreground">
            {isLoading ? '...' : dossiers.filter((d) => d.status === 'closed').length}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">
            {t('civilProcedures')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading ? '...' : dossiers.filter((d) => d.type === 'civil').length}
          </div>
        </div>
      </div>

      {/* Liste des dossiers */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span>Chargement des dossiers...</span>
          </div>
        </div>
      ) : dossiers && dossiers.length > 0 ? (
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
          <p className="mt-2 text-sm font-medium text-foreground">
            {t('noDossiers')}
          </p>
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
