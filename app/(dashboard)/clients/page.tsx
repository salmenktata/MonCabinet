'use client'

import { useState, useDeferredValue } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search, Users, User, Building2 } from 'lucide-react'
import { useClientList } from '@/lib/hooks/useClients'
import ClientCard from '@/components/clients/ClientCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { usePlanQuota, getCountAlertLevel } from '@/lib/hooks/usePlanQuota'

type TypeFilter = 'all' | 'physical' | 'legal'

export default function ClientsPage() {
  const t = useTranslations('clients')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const deferredSearch = useDeferredValue(search)
  const { data: quota } = usePlanQuota()

  const { data, isLoading, error } = useClientList({
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: deferredSearch || undefined,
  })

  const allClients = data?.clients || []

  const isPhysical = (c: any) =>
    c.typeClient === 'particulier' ||
    c.typeClient === 'PERSONNE_PHYSIQUE' ||
    c.type_client === 'personne_physique'

  const isLegal = (c: any) =>
    c.typeClient === 'entreprise' ||
    c.typeClient === 'PERSONNE_MORALE' ||
    c.type_client === 'personne_morale'

  const clients = allClients.filter((c) => {
    if (typeFilter === 'physical') return isPhysical(c)
    if (typeFilter === 'legal') return isLegal(c)
    return true
  })

  const physicalCount = allClients.filter(isPhysical).length
  const legalCount = allClients.filter(isLegal).length

  const filterButtons: { key: TypeFilter; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: t('filterAll'), icon: <Users className="h-3.5 w-3.5" />, count: allClients.length },
    { key: 'physical', label: t('filterPhysical'), icon: <User className="h-3.5 w-3.5" />, count: physicalCount },
    { key: 'legal', label: t('filterLegal'), icon: <Building2 className="h-3.5 w-3.5" />, count: legalCount },
  ]

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
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          + {t('newClient')}
        </Link>
      </div>

      {/* Bandeau limite clients */}
      {quota && quota.maxClients > 0 && (() => {
        const level = getCountAlertLevel(quota.currentClients, quota.maxClients)
        if (level === 'safe') return null
        const remaining = quota.maxClients - quota.currentClients
        return (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-sm ${
            level === 'danger'
              ? 'bg-red-500/10 border-red-500/30 text-red-300'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300'
          }`}>
            <span>
              {level === 'danger'
                ? `Limite atteinte — ${quota.currentClients}/${quota.maxClients} clients utilisés`
                : `${remaining} client${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} sur ${quota.maxClients} (essai)`}
            </span>
            <Link href="/upgrade" className="font-semibold underline underline-offset-2 whitespace-nowrap hover:opacity-80">
              Passer à Pro →
            </Link>
          </div>
        )
      })()}

      {/* Statistiques */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="h-4 w-4 text-blue-500" />
            {t('totalClients')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : allClients.length}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <User className="h-4 w-4 text-blue-500" />
            {t('naturalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-blue-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : physicalCount}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Building2 className="h-4 w-4 text-purple-500" />
            {t('legalPersons')}
          </div>
          <div className="mt-2 text-3xl font-bold text-purple-600">
            {isLoading ? <Skeleton className="h-8 w-12" /> : legalCount}
          </div>
        </div>
      </div>

      {/* Recherche + Filtres */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setTypeFilter(btn.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === btn.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {btn.icon}
              {btn.label}
              <span
                className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                  typeFilter === btn.key
                    ? 'bg-white/20 text-white'
                    : 'bg-background text-foreground'
                }`}
              >
                {isLoading ? '–' : btn.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Liste des clients */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-16 rounded-full" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-1/2" />
              <div className="flex gap-2 pt-1">
                <Skeleton className="h-8 flex-1 rounded-md" />
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : clients.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">
            {search ? `Aucun résultat pour "${search}"` : t('noClients')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {!search && t('createFirstClient')}
          </p>
          {!search && (
            <div className="mt-6">
              <Link
                href="/clients/new"
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                + {t('newClient')}
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
