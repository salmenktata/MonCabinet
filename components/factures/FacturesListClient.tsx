'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { FacturesDataTable } from './FacturesDataTable'

interface FactureData {
  id: string
  numero: string
  objet: string
  statut: 'brouillon' | 'envoyee' | 'payee' | 'impayee'
  montant_ht: string | number
  montant_ttc: string | number
  date_emission: string
  date_echeance?: string
  date_paiement?: string
  type_honoraires?: string
  clients?: {
    id?: string
    type_client: string
    nom: string
    prenom?: string
    email?: string
  }
  dossiers?: {
    id?: string
    numero?: string
    objet?: string
  }
}

const STATUS_TABS = [
  { value: 'all', label: 'Toutes' },
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'envoyee', label: 'Envoyées' },
  { value: 'payee', label: 'Payées' },
  { value: 'impayee', label: 'Impayées' },
] as const

function getClientName(client?: FactureData['clients']) {
  if (!client) return ''
  return client.type_client === 'personne_physique'
    ? `${client.prenom || ''} ${client.nom}`.trim()
    : client.nom
}

export default function FacturesListClient({ factures }: { factures: FactureData[] }) {
  const [activeStatus, setActiveStatus] = useState<string>('all')
  const [search, setSearch] = useState('')

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: factures.length }
    for (const f of factures) {
      counts[f.statut] = (counts[f.statut] || 0) + 1
    }
    return counts
  }, [factures])

  const filtered = useMemo(() => {
    return factures.filter((f) => {
      if (activeStatus !== 'all' && f.statut !== activeStatus) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const clientName = getClientName(f.clients)
        if (
          !f.numero.toLowerCase().includes(q) &&
          !f.objet.toLowerCase().includes(q) &&
          !clientName.toLowerCase().includes(q)
        ) {
          return false
        }
      }
      return true
    })
  }, [factures, activeStatus, search])

  const normalizedFactures = useMemo(
    () =>
      filtered.map((f) => ({
        ...f,
        montant_ht: parseFloat(String(f.montant_ht)) || 0,
        montant_ttc: parseFloat(String(f.montant_ttc)) || 0,
      })),
    [filtered]
  )

  const isEmpty = filtered.length === 0

  return (
    <div className="space-y-4">
      {/* Filtres + recherche */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeStatus} onValueChange={setActiveStatus}>
          <TabsList className="h-8 flex-wrap">
            {STATUS_TABS.map((tab) => {
              const count = statusCounts[tab.value] ?? 0
              if (tab.value !== 'all' && count === 0) return null
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="h-7 text-xs gap-1.5">
                  {tab.label}
                  {count > 0 && (
                    <Badge
                      variant={activeStatus === tab.value ? 'default' : 'secondary'}
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
          <Icons.invoices className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {search || activeStatus !== 'all' ? 'Aucun résultat' : 'Aucune facture'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search
              ? `Aucune facture ne correspond à "${search}"`
              : activeStatus !== 'all'
                ? 'Aucune facture avec ce statut'
                : 'Créez votre première facture pour commencer'}
          </p>
          {!search && activeStatus === 'all' && (
            <div className="mt-4">
              <Button asChild size="sm">
                <Link href="/factures/new">
                  <Icons.add className="mr-1.5 h-4 w-4" />
                  Nouvelle facture
                </Link>
              </Button>
            </div>
          )}
        </div>
      ) : (
        <FacturesDataTable factures={normalizedFactures} />
      )}
    </div>
  )
}
