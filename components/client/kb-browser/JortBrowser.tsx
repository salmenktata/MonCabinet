'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Newspaper, Search, X, ChevronRight, Calendar, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

// =============================================================================
// TYPES
// =============================================================================

interface JortDoc {
  kbId: string
  title: string
  updatedAt: string
  metadata: Record<string, unknown>
}

interface JortBrowserProps {
  onBack: () => void
}

// =============================================================================
// HELPERS
// =============================================================================

function getJortDate(doc: JortDoc): string {
  // Priorité : metadata.jort_date, puis updatedAt
  const d = (doc.metadata.jort_date as string | undefined) || doc.updatedAt
  return d ? d.slice(0, 10) : ''
}

function getJortYear(doc: JortDoc): number {
  const d = getJortDate(doc)
  return d ? parseInt(d.slice(0, 4), 10) : 0
}

function formatJortDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('fr-TN', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch {
    return dateStr.slice(0, 10)
  }
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function JortBrowser({ onBack }: JortBrowserProps) {
  const router = useRouter()

  const [docs, setDocs] = useState<JortDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setIsLoading(true)
    // Charger jusqu'à 200 JORT (limite API = 100, on fait 2 pages si nécessaire)
    Promise.all([
      fetch('/api/client/kb/browse?category=jort&limit=100&offset=0&sort=date').then((r) => r.ok ? r.json() : null),
      fetch('/api/client/kb/browse?category=jort&limit=100&offset=100&sort=date').then((r) => r.ok ? r.json() : null),
    ])
      .then(([page1, page2]) => {
        const all: JortDoc[] = [
          ...(page1?.results || []),
          ...(page2?.results || []),
        ]
        setDocs(all)
        // Sélectionner l'année la plus récente par défaut
        if (all.length > 0) {
          const latestYear = Math.max(...all.map(getJortYear).filter(Boolean))
          setSelectedYear(latestYear || null)
        }
      })
      .catch((err) => setError(err.message || 'Erreur de chargement'))
      .finally(() => setIsLoading(false))
  }, [])

  const availableYears = useMemo(() => {
    const years = [...new Set(docs.map(getJortYear).filter((y) => y > 0))]
    return years.sort((a, b) => b - a)
  }, [docs])

  const filteredDocs = useMemo(() => {
    let list = docs
    if (selectedYear) {
      list = list.filter((d) => getJortYear(d) === selectedYear)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          String(d.metadata.jort_number || '').toLowerCase().includes(q)
      )
    }
    // Tri par date desc dans l'année
    return list.sort((a, b) => getJortDate(b).localeCompare(getJortDate(a)))
  }, [docs, selectedYear, search])

  return (
    <div className="container mx-auto py-6 max-w-4xl">

      {/* ─── TOP BAR ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 h-8 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400">
            <Newspaper className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">JORT — Journal Officiel</h1>
            <p className="text-xs text-muted-foreground mt-0.5">الرائد الرسمي للجمهورية التونسية</p>
          </div>
        </div>
        {!isLoading && docs.length > 0 && (
          <Badge variant="secondary" className="ml-auto">
            {docs.length} publications
          </Badge>
        )}
      </div>

      {/* ─── FILTRES ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Barre de recherche */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par titre ou numéro JORT…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Sélecteur d'année */}
        {availableYears.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedYear(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedYear === null
                  ? 'bg-foreground text-background border-foreground'
                  : 'border-border hover:bg-muted'
              }`}
            >
              Toutes
            </button>
            {availableYears.slice(0, 8).map((year) => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  selectedYear === year
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border hover:bg-muted'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── CONTENU ────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => window.location.reload()}>
            Réessayer
          </Button>
        </div>
      )}

      {!isLoading && !error && filteredDocs.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search
            ? `Aucun résultat pour "${search}"`
            : selectedYear
              ? `Aucune publication JORT pour ${selectedYear}`
              : 'Aucune publication JORT disponible'
          }
        </div>
      )}

      {!isLoading && !error && filteredDocs.length > 0 && (
        <div className="space-y-1.5">
          {filteredDocs.map((doc) => {
            const jortDate = getJortDate(doc)
            const jortNumber = doc.metadata.jort_number as string | undefined
            return (
              <button
                key={doc.kbId}
                onClick={() => router.push(`/client/knowledge-base/${doc.kbId}`)}
                className="w-full text-left border rounded-lg px-4 py-3 bg-card hover:bg-muted/50 hover:border-red-300 dark:hover:border-red-800 transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-foreground">
                      {doc.title}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {jortDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatJortDate(jortDate)}
                        </span>
                      )}
                      {jortNumber && (
                        <span className="font-medium text-red-700 dark:text-red-400">
                          N° {jortNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-foreground transition-colors" />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {!isLoading && !error && filteredDocs.length > 0 && (
        <p className="text-xs text-muted-foreground text-center mt-4">
          {filteredDocs.length} publication{filteredDocs.length > 1 ? 's' : ''} affichée{filteredDocs.length > 1 ? 's' : ''}
          {selectedYear ? ` en ${selectedYear}` : ''}
        </p>
      )}
    </div>
  )
}
