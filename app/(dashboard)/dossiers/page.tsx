'use client'

import { useState, useDeferredValue } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search, FolderOpen, FolderX, Archive, Folders } from 'lucide-react'
import { useDossierList } from '@/lib/hooks/useDossiers'
import DossierCard from '@/components/dossiers/DossierCard'
import { Skeleton } from '@/components/ui/skeleton'

type StatusFilter = 'all' | 'active' | 'closed' | 'archived'

export default function DossiersPage() {
  const t = useTranslations('dossiers')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const deferredSearch = useDeferredValue(search)

  const { data, isLoading, error } = useDossierList({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: deferredSearch || undefined,
  })

  const allDossiers = data?.dossiers || []

  // Filtrer côté client par statut (cast string pour éviter erreurs TS sur enums stricts)
  const dossiers = allDossiers.filter((d) => {
    if (statusFilter === 'all') return true
    const s = (d.status || d.statut) as string
    if (statusFilter === 'active') return s === 'open' || s === 'in_progress' || s === 'actif' || s === 'en_cours'
    if (statusFilter === 'closed') return s === 'closed' || s === 'clos'
    if (statusFilter === 'archived') return s === 'archived' || s === 'archive'
    return true
  })

  // Stats corrigées
  const totalCount = allDossiers.length
  const activeCount = allDossiers.filter((d) => {
    const s = (d.status || d.statut) as string
    return s === 'open' || s === 'in_progress' || s === 'actif' || s === 'en_cours'
  }).length
  const closedCount = allDossiers.filter((d) => {
    const s = (d.status || d.statut) as string
    return s === 'closed' || s === 'clos'
  }).length
  const civilCount = allDossiers.filter((d) => {
    const type = (d.type as string) || ''
    return type === 'civil_premiere_instance' || type === 'civil'
  }).length

  const filterButtons: { key: StatusFilter; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: t('filterAll'), icon: <Folders className="h-3.5 w-3.5" /> },
    { key: 'active', label: t('filterActive'), icon: <FolderOpen className="h-3.5 w-3.5" /> },
    { key: 'closed', label: t('filterClosed'), icon: <FolderX className="h-3.5 w-3.5" /> },
    { key: 'archived', label: t('filterArchived'), icon: <Archive className="h-3.5 w-3.5" /> },
  ]

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
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
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
            className="rounded-md bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            + {t('newDossier')}
          </Link>
        </div>
      </div>

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('totalDossiers')}</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : totalCount}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('activeDossiers')}</div>
          <div className="mt-1 text-3xl font-bold text-emerald-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : activeCount}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('closedDossiers')}</div>
          <div className="mt-1 text-3xl font-bold text-muted-foreground">
            {isLoading ? <Skeleton className="h-8 w-12" /> : closedCount}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="text-sm font-medium text-muted-foreground">{t('civilProcedures')}</div>
          <div className="mt-1 text-3xl font-bold text-blue-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : civilCount}
          </div>
        </div>
      </div>

      {/* Search + filtres */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Filtres rapides */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filterButtons.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {icon}
              {label}
              {key === 'all' && !isLoading && (
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusFilter === key ? 'bg-white/20' : 'bg-muted-foreground/20'}`}>
                  {totalCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des dossiers */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="space-y-1.5 pt-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="pt-3 border-t border-border/50 space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : dossiers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dossiers.map((dossier) => (
            <DossierCard key={dossier.id} dossier={dossier} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">
            {search || statusFilter !== 'all' ? 'Aucun résultat' : t('noDossiers')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? `Aucun dossier trouvé pour "${search}"`
              : statusFilter !== 'all'
              ? 'Aucun dossier dans cette catégorie'
              : t('createFirstDossier')}
          </p>
          {!search && statusFilter === 'all' && (
            <div className="mt-6">
              <Link
                href="/dossiers/new"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                + {t('newDossier')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
