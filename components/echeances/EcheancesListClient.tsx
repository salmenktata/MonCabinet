'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { niveauUrgence } from '@/lib/utils/delais-tunisie'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'
import EcheanceCard from './EcheanceCard'

interface EcheanceData {
  id: string
  titre: string
  description?: string
  date_echeance: string
  type_echeance: 'audience' | 'delai_legal' | 'delai_interne' | 'autre'
  statut: 'actif' | 'respecte' | 'depasse'
  delai_type?: string
  date_point_depart?: string
  nombre_jours?: number
  rappel_j15: boolean
  rappel_j7: boolean
  rappel_j3: boolean
  rappel_j1: boolean
  dossiers?: {
    id: string
    numero: string
    objet?: string
    clients?: { type_client: string; nom: string; prenom?: string }
  }
}

interface EcheancesListClientProps {
  echeances: EcheanceData[]
}

const TYPE_TABS = [
  { value: 'all', labelKey: 'filterAll' },
  { value: 'audience', labelKey: 'hearings' },
  { value: 'delai_legal', labelKey: 'legalDeadlines' },
  { value: 'delai_interne', labelKey: 'internalDeadlines' },
  { value: 'autre', labelKey: 'filterOther' },
] as const

const SECTIONS = [
  { key: 'depasse',  labelKey: 'overdueSection',  colorClass: 'text-red-600' },
  { key: 'critique', labelKey: 'criticalSection', colorClass: 'text-orange-600' },
  { key: 'urgent',   labelKey: 'urgentSection',   colorClass: 'text-yellow-600' },
  { key: 'proche',   labelKey: 'upcomingSection', colorClass: 'text-blue-600' },
  { key: 'normal',   labelKey: 'futureSection',   colorClass: 'text-foreground' },
] as const

function getClientName(clients?: { type_client: string; nom: string; prenom?: string }) {
  if (!clients) return ''
  return clients.type_client === 'personne_physique'
    ? `${clients.nom} ${clients.prenom || ''}`.trim()
    : clients.nom
}

export default function EcheancesListClient({ echeances }: EcheancesListClientProps) {
  const t = useTranslations('echeances')
  const [activeType, setActiveType] = useState<string>('all')
  const [search, setSearch] = useState('')

  const aujourdhui = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Counts par type pour les badges
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: echeances.length }
    for (const e of echeances) {
      counts[e.type_echeance] = (counts[e.type_echeance] || 0) + 1
    }
    return counts
  }, [echeances])

  // Filtrage combiné type + recherche
  const filtered = useMemo(() => {
    return echeances.filter((e) => {
      if (activeType !== 'all' && e.type_echeance !== activeType) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const clientName = getClientName(e.dossiers?.clients)
        if (
          !e.titre.toLowerCase().includes(q) &&
          !(e.dossiers?.numero ?? '').toLowerCase().includes(q) &&
          !clientName.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [echeances, activeType, search])

  // Groupement par urgence
  const grouped = useMemo(() => {
    const groups: Record<string, EcheanceData[]> = {
      depasse: [],
      critique: [],
      urgent: [],
      proche: [],
      normal: [],
    }
    for (const e of filtered) {
      const dateEcheance = new Date(e.date_echeance)
      if (dateEcheance < aujourdhui) {
        groups.depasse.push(e)
      } else {
        const urgence = niveauUrgence(dateEcheance)
        groups[urgence]?.push(e)
      }
    }
    return groups
  }, [filtered, aujourdhui])

  const isEmpty = filtered.length === 0

  return (
    <div className="space-y-5">
      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeType} onValueChange={setActiveType}>
          <TabsList className="h-8 flex-wrap">
            {TYPE_TABS.map((tab) => {
              const count = typeCounts[tab.value] ?? 0
              if (tab.value !== 'all' && count === 0) return null
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 text-xs gap-1.5">
                  {t(tab.labelKey)}
                  {count > 0 && (
                    <Badge
                      variant={activeType === tab.value ? 'default' : 'secondary'}
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
          <Icons.calendar className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {search ? 'Aucun résultat' : t('noDeadlines')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search ? `Aucune échéance ne correspond à "${search}"` : t('deadlinesWillAppear')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {SECTIONS.map(({ key, labelKey, colorClass }) => {
            const items = grouped[key]
            if (!items || items.length === 0) return null
            return (
              <div key={key}>
                <div className={cn('flex items-center gap-2 mb-3', colorClass)}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide">
                    {t(labelKey)}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn('h-4 min-w-4 px-1 text-[10px] leading-none border', colorClass)}
                  >
                    {items.length}
                  </Badge>
                </div>
                <div className="grid gap-3">
                  {items.map((echeance) => (
                    <EcheanceCard key={echeance.id} echeance={echeance} showDossierInfo />
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
