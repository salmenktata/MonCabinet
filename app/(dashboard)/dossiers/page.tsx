'use client'

import { useState, useDeferredValue, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  Search,
  FolderOpen,
  FolderX,
  Archive,
  Folders,
  Sparkles,
  Plus,
  Loader2,
} from 'lucide-react'
import { useDossierInfiniteList } from '@/lib/hooks/useDossiers'
import DossierCard from '@/components/dossiers/DossierCard'
import DossiersFilters, { type FilterState } from '@/components/dossiers/DossiersFilters'
import { Skeleton } from '@/components/ui/skeleton'
import { usePlanQuota, getCountAlertLevel } from '@/lib/hooks/usePlanQuota'

type StatusFilter = 'all' | 'active' | 'closed' | 'archived'

const STATUS_MAP: Record<StatusFilter, string | undefined> = {
  all: undefined,
  active: 'open',
  closed: 'closed',
  archived: 'archived',
}

export default function DossiersPage() {
  const t = useTranslations('dossiers')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [filters, setFilters] = useState<FilterState>({
    typeFilter: undefined,
    priorityFilter: undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  })
  const deferredSearch = useDeferredValue(search)
  const { data: quota } = usePlanQuota()

  const sentinelRef = useRef<HTMLDivElement>(null)

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error } =
    useDossierInfiniteList({
      search: deferredSearch || undefined,
      status: STATUS_MAP[statusFilter] as any,
      type: filters.typeFilter as any,
      priority: filters.priorityFilter as any,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      limit: 12,
    })

  // Infinite scroll via IntersectionObserver
  const handleSentinel = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(handleSentinel, { threshold: 0.1 })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [handleSentinel])

  const allDossiers = data?.pages.flatMap((p) => p.dossiers) ?? []
  const total = data?.pages[0]?.total ?? 0

  // Stats depuis tous les dossiers chargés (approximatif - on utilise le total server)
  const activeCount = allDossiers.filter((d) => {
    const s = (d.status || d.statut) as string
    return s === 'open' || s === 'in_progress' || s === 'actif' || s === 'en_cours'
  }).length

  // Filtres actifs count
  const activeFiltersCount = [
    filters.typeFilter !== undefined,
    filters.priorityFilter !== undefined,
    filters.sortBy !== 'createdAt' || filters.sortOrder !== 'desc',
  ].filter(Boolean).length

  function handleFilterChange(partial: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }))
  }

  function handleFilterReset() {
    setFilters({ typeFilter: undefined, priorityFilter: undefined, sortBy: 'createdAt', sortOrder: 'desc' })
  }

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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/qadhya-ia/structure"
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 px-3 py-1.5 text-sm text-blue-700 dark:text-blue-300 font-medium hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t('newWithAI')}
          </Link>
          <Link
            href="/dossiers/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('newDossier')}
          </Link>
        </div>
      </div>

      {/* Bandeau limite dossiers */}
      {quota && quota.maxDossiers > 0 && (() => {
        const level = getCountAlertLevel(quota.currentDossiers, quota.maxDossiers)
        if (level === 'safe') return null
        const remaining = quota.maxDossiers - quota.currentDossiers
        return (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-sm ${
            level === 'danger'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
          }`}>
            <span>
              {level === 'danger'
                ? `Limite atteinte — ${quota.currentDossiers}/${quota.maxDossiers} dossiers utilisés`
                : `${remaining} dossier${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} sur ${quota.maxDossiers} (essai)`}
            </span>
            <Link href="/upgrade" className="font-semibold underline underline-offset-2 whitespace-nowrap hover:opacity-80">
              Passer à Solo →
            </Link>
          </div>
        )
      })()}

      {/* Toolbar : search + stats chips + filtres avancés */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="w-full rounded-lg border bg-background pl-9 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filtres avancés */}
          <DossiersFilters
            {...filters}
            activeCount={activeFiltersCount}
            onChange={handleFilterChange}
            onReset={handleFilterReset}
          />
        </div>

        {/* Pills statut + stats chips */}
        <div className="flex items-center gap-2 flex-wrap">
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
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusFilter === key ? 'bg-white/20' : 'bg-muted-foreground/20'}`}>
                  {total}
                </span>
              )}
            </button>
          ))}

          {/* Stats compactes */}
          {!isLoading && total > 0 && (
            <div className="ms-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t('activeDossiers')} ({activeCount})
              </span>
              <span>{total} {t('totalDossiers').toLowerCase()}</span>
            </div>
          )}
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
      ) : allDossiers.length > 0 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {allDossiers.map((dossier) => (
              <DossierCard key={dossier.id} dossier={dossier} />
            ))}
          </div>

          {/* Sentinel pour infinite scroll */}
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('loadingMore')}
              </div>
            ) : !hasNextPage && allDossiers.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t('allLoaded')}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">
            {search || statusFilter !== 'all' || activeFiltersCount > 0
              ? 'Aucun résultat'
              : t('noDossiers')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? `Aucun dossier trouvé pour "${search}"`
              : statusFilter !== 'all' || activeFiltersCount > 0
              ? 'Aucun dossier correspond à ces critères'
              : t('createFirstDossier')}
          </p>
          {!search && statusFilter === 'all' && activeFiltersCount === 0 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Link
                href="/qadhya-ia/structure"
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
              >
                <Sparkles className="h-4 w-4" />
                {t('newWithAI')}
              </Link>
              <Link
                href="/dossiers/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                {t('newDossier')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
