'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'
import { cn } from '@/lib/utils'
import TimeEntryCard from './TimeEntryCard'
import type { TimeEntry } from '@/types/time-tracking'

interface TimeEntriesListClientProps {
  entries: TimeEntry[]
}

const FILTER_TABS = [
  { value: 'all', label: 'Tout' },
  { value: 'billable', label: 'Facturable' },
  { value: 'billed', label: 'Facturé' },
  { value: 'non_billable', label: 'Non facturable' },
] as const

const SECTIONS = [
  { key: 'today', label: "Aujourd'hui", colorClass: 'text-foreground' },
  { key: 'week', label: 'Cette semaine', colorClass: 'text-blue-600' },
  { key: 'month', label: 'Ce mois', colorClass: 'text-foreground' },
  { key: 'older', label: 'Plus ancien', colorClass: 'text-muted-foreground' },
] as const

export default function TimeEntriesListClient({ entries }: TimeEntriesListClientProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const startOfWeek = useMemo(() => {
    const d = new Date(today)
    d.setDate(today.getDate() - today.getDay())
    return d
  }, [today])

  const startOfMonth = useMemo(() => {
    return new Date(today.getFullYear(), today.getMonth(), 1)
  }, [today])

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: entries.length }
    for (const e of entries) {
      if (e.facture_id) {
        counts.billed = (counts.billed || 0) + 1
      } else if (e.facturable) {
        counts.billable = (counts.billable || 0) + 1
      } else {
        counts.non_billable = (counts.non_billable || 0) + 1
      }
    }
    return counts
  }, [entries])

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (activeFilter === 'billable' && !(e.facturable && !e.facture_id)) return false
      if (activeFilter === 'billed' && !e.facture_id) return false
      if (activeFilter === 'non_billable' && e.facturable) return false

      if (search.trim()) {
        const q = search.toLowerCase()
        if (
          !(e.description ?? '').toLowerCase().includes(q) &&
          !(e.dossiers?.numero ?? '').toLowerCase().includes(q) &&
          !(e.dossiers?.objet ?? '').toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [entries, activeFilter, search])

  const grouped = useMemo(() => {
    const groups: Record<string, TimeEntry[]> = {
      today: [],
      week: [],
      month: [],
      older: [],
    }
    for (const e of filtered) {
      const entryDate = new Date(e.date)
      entryDate.setHours(0, 0, 0, 0)
      if (entryDate >= today) {
        groups.today.push(e)
      } else if (entryDate >= startOfWeek) {
        groups.week.push(e)
      } else if (entryDate >= startOfMonth) {
        groups.month.push(e)
      } else {
        groups.older.push(e)
      }
    }
    return groups
  }, [filtered, today, startOfWeek, startOfMonth])

  const isEmpty = filtered.length === 0

  return (
    <div className="space-y-5">
      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeFilter} onValueChange={setActiveFilter}>
          <TabsList className="h-8 flex-wrap">
            {FILTER_TABS.map((tab) => {
              const count = filterCounts[tab.value] ?? 0
              if (tab.value !== 'all' && count === 0) return null
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 text-xs gap-1.5">
                  {tab.label}
                  {count > 0 && (
                    <Badge
                      variant={activeFilter === tab.value ? 'default' : 'secondary'}
                      className="h-4 min-w-4 px-1 text-[10px] leading-none"
                    >
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-56">
          <Icons.search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Contenu */}
      {isEmpty ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <Icons.timeTracking className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {search ? 'Aucun résultat' : 'Aucune entrée de temps'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search
              ? `Aucune entrée ne correspond à "${search}"`
              : 'Commencez à enregistrer votre temps de travail.'}
          </p>
          {!search && (
            <Button asChild size="sm" className="mt-4">
              <Link href="/time-tracking/new">
                <Icons.add className="mr-1.5 h-4 w-4" />
                Nouvelle entrée
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ key, label, colorClass }) => {
            const items = grouped[key]
            if (!items || items.length === 0) return null
            return (
              <div key={key}>
                <div className={cn('flex items-center gap-2 mb-3', colorClass)}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide">{label}</h2>
                  <Badge
                    variant="outline"
                    className={cn('h-4 min-w-4 px-1 text-[10px] leading-none border', colorClass)}
                  >
                    {items.length}
                  </Badge>
                </div>
                <div className="grid gap-3">
                  {items.map((entry) => (
                    <TimeEntryCard key={entry.id} entry={entry} showDossierInfo />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
