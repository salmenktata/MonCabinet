'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Download, Loader2 } from 'lucide-react'
import { AbrogationCard } from './abrogation-card'
import { DomainFilter } from './domain-badge'
import type {
  LegalAbrogation,
  LegalDomain,
  AbrogationListResponse,
} from '@/types/legal-abrogations'

interface AbrogationsListProps {
  initialDomain?: string
  initialPage?: number
  initialSearch?: string
}

export function AbrogationsList({
  initialDomain,
  initialPage = 1,
  initialSearch = '',
}: AbrogationsListProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [domain, setDomain] = useState<LegalDomain | 'all'>((initialDomain as LegalDomain) || 'all')
  const [searchQuery, setSearchQuery] = useState(initialSearch)
  const [page, setPage] = useState(initialPage)
  const [sortBy, setSortBy] = useState('abrogation_date_desc')
  const [limit, setLimit] = useState(10)

  const [data, setData] = useState<AbrogationListResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch data
  const fetchAbrogations = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (domain !== 'all') params.set('domain', domain)
      params.set('sort', sortBy)
      params.set('limit', limit.toString())
      params.set('offset', ((page - 1) * limit).toString())

      let url = `/api/legal/abrogations?${params.toString()}`

      // Si recherche, utiliser l'endpoint de recherche fuzzy
      if (searchQuery.trim()) {
        const searchParams = new URLSearchParams()
        searchParams.set('q', searchQuery)
        searchParams.set('threshold', '0.4')
        searchParams.set('limit', limit.toString())
        if (domain !== 'all') searchParams.set('domain', domain)

        url = `/api/legal/abrogations/search?${searchParams.toString()}`
      }

      const res = await fetch(url)
      if (!res.ok) throw new Error('Erreur lors du chargement des abrogations')

      const responseData = await res.json()
      setData(responseData)

      // Update URL
      const newSearchParams = new URLSearchParams(searchParams)
      if (domain !== 'all') newSearchParams.set('domain', domain)
      else newSearchParams.delete('domain')
      if (searchQuery) newSearchParams.set('search', searchQuery)
      else newSearchParams.delete('search')
      newSearchParams.set('page', page.toString())

      router.push(`?${newSearchParams.toString()}`, { scroll: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [domain, searchQuery, page, sortBy, limit, router, searchParams])

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchAbrogations()
  }, [fetchAbrogations])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [domain, searchQuery, sortBy, limit])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchAbrogations()
  }

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  const handleExport = async () => {
    try {
      const params = new URLSearchParams()
      if (domain !== 'all') params.set('domain', domain)
      params.set('limit', '1000') // Max export

      const res = await fetch(`/api/legal/abrogations?${params.toString()}`)
      const exportData = await res.json()

      // Convert to CSV
      const csv = convertToCSV(exportData.data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `abrogations_${domain}_${new Date().toISOString().split('T')[0]}.csv`
      link.click()
    } catch (err) {
      console.error('Export error:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="space-y-4">
        {/* Recherche */}
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Rechercher par référence (ex: Code pénal, Loi n°9/2025...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rechercher'}
          </Button>
        </form>

        {/* Filtre domaine */}
        <DomainFilter selected={domain} onChange={(d) => setDomain(d)} />

        {/* Options */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Trier par" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abrogation_date_desc">Date (récent)</SelectItem>
                <SelectItem value="abrogation_date_asc">Date (ancien)</SelectItem>
                <SelectItem value="relevance">Pertinence</SelectItem>
              </SelectContent>
            </Select>

            <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 par page</SelectItem>
                <SelectItem value="25">25 par page</SelectItem>
                <SelectItem value="50">50 par page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exporter CSV
          </Button>
        </div>
      </div>

      {/* Résultats */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-destructive">{error}</p>
          <Button onClick={fetchAbrogations} variant="outline" className="mt-4">
            Réessayer
          </Button>
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Aucune abrogation trouvée</p>
          {(domain !== 'all' || searchQuery) && (
            <Button
              onClick={() => {
                setDomain('all')
                setSearchQuery('')
              }}
              variant="outline"
              className="mt-4"
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>
      ) : data ? (
        <>
          {/* Compteur */}
          <div className="text-sm text-muted-foreground">
            {searchQuery
              ? `${data.total} résultat${data.total > 1 ? 's' : ''} pour "${searchQuery}"`
              : `${data.total} abrogation${data.total > 1 ? 's' : ''} ${domain !== 'all' ? `(${domain})` : ''}`}
          </div>

          {/* Liste */}
          <div className="grid gap-4">
            {data.data.map((abrogation) => (
              <AbrogationCard key={abrogation.id} abrogation={abrogation} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Précédent
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} sur {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages || loading}
              >
                Suivant
              </Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

function convertToCSV(data: LegalAbrogation[]): string {
  const headers = [
    'Référence Abrogée',
    'Référence Abrogée (AR)',
    'Référence Abrogeante',
    'Référence Abrogeante (AR)',
    'Date',
    'Type',
    'Articles',
    'Domaine',
    'JORT',
    'Source',
    'Notes',
  ]

  const rows = data.map((a) => [
    a.abrogatedReference,
    a.abrogatedReferenceAr,
    a.abrogatingReference,
    a.abrogatingReferenceAr,
    new Date(a.abrogationDate).toLocaleDateString('fr-TN'),
    a.scope,
    a.affectedArticles?.join('; ') || '',
    a.domain || '',
    a.jortUrl || '',
    a.sourceUrl || '',
    a.notes || '',
  ])

  return [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
}
