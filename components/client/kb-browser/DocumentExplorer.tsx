'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Search, Filter, Grid3x3, List, SortAsc, ChevronDown, ChevronRight, AlertCircle, Loader2, ArrowLeft, X, Lightbulb, Scale } from 'lucide-react'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'
import { NORM_LEVELS_ORDERED, getNormLevelLabel, type NormLevel } from '@/lib/categories/norm-levels'
import { LEGAL_DOMAINS } from '@/lib/categories/legal-domains'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentDetailModal } from './DocumentDetailModal'
import { DocumentCard } from './DocumentCard'
import { getCategoryLabel } from './kb-browser-utils'
import { RecentSearchesDropdown } from './RecentSearchesDropdown'
import { useRAGSearchMutation } from '@/lib/hooks/useRAGSearch'
import type { RAGSearchResult as APISearchResult } from '@/lib/hooks/useRAGSearch'
import { useKBBrowse } from '@/lib/hooks/useKBBrowse'
import { LEGAL_DOMAIN_MAP } from '@/lib/categories/legal-domains'

// =============================================================================
// TYPES
// =============================================================================

export interface SearchResultItem {
  kbId: string
  title: string
  category: string
  normLevel?: string | null
  docType?: string | null
  updatedAt?: string | null
  similarity: number | null
  chunkContent?: string
  metadata: {
    tribunalCode?: string | null
    tribunalLabelAr?: string | null
    tribunalLabelFr?: string | null
    chambreCode?: string | null
    chambreLabelAr?: string | null
    chambreLabelFr?: string | null
    decisionDate?: string | null
    decisionNumber?: string | null
    legalBasis?: string[] | null
    extractionConfidence?: number | null
    citesCount?: number
    citedByCount?: number
    statut_vigueur?: string | null
    source?: string | null
    source_url?: string | null
    [key: string]: unknown
  }
  relations?: {
    cites?: Array<{ relatedKbId?: string; relationType: string; relatedTitle: string; relatedCategory: string; context: string | null; confidence: number | null }>
    citedBy?: Array<{ relatedKbId?: string; relationType: string; relatedTitle: string; relatedCategory: string; context: string | null; confidence: number | null }>
    supersedes?: Array<{ relatedKbId?: string; relationType: string; relatedTitle: string; relatedCategory: string; context: string | null; confidence: number | null }>
    supersededBy?: Array<{ relatedKbId?: string; relationType: string; relatedTitle: string; relatedCategory: string; context: string | null; confidence: number | null }>
    relatedCases?: Array<{ relatedKbId?: string; relationType: string; relatedTitle: string; relatedCategory: string; context: string | null; confidence: number | null }>
  }
}

export interface DocumentFilters {
  category?: string
  normLevel?: NormLevel
  domain?: string
  tribunal?: string
  chambre?: string
  language?: 'fr' | 'ar' | 'bi'
  dateFrom?: string
  dateTo?: string
}

export interface DocumentExplorerProps {
  initialCategory?: string
  initialQuery?: string
  initialDocType?: string
  initialDomain?: string
  onBack?: () => void
  className?: string
}

type ViewMode = 'list' | 'grid'
type SortField = 'relevance' | 'date' | 'title' | 'citations'
type SortOrder = 'asc' | 'desc'

// Labels pour les filtres actifs
const TRIBUNAL_LABELS: Record<string, string> = {
  TRIBUNAL_CASSATION: 'Cassation',
  COUR_APPEL: 'Cour d\'appel',
  TRIBUNAL_PREMIERE_INSTANCE: 'Première instance',
  TRIBUNAL_ADMINISTRATIF: 'Tribunal administratif',
  TRIBUNAL_IMMOBILIER: 'Tribunal immobilier',
  TRIBUNAL_MILITAIRE: 'Tribunal militaire',
  TRIBUNAL_CANTONAL: 'Justice cantonale',
}

const LANGUAGE_LABELS: Record<string, string> = {
  fr: 'Français',
  ar: 'Arabe',
  bi: 'Bilingue',
}

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

// Années disponibles pour filtre date (2000 → année courante)
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i)

// Helpers URL params
function buildParams(base: URLSearchParams, updates: Record<string, string | undefined>): string {
  const next = new URLSearchParams(base.toString())
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === '') {
      next.delete(key)
    } else {
      next.set(key, value)
    }
  }
  return next.toString()
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function DocumentExplorer({
  initialCategory,
  initialQuery,
  initialDocType,
  initialDomain,
  onBack,
  className = '',
}: DocumentExplorerProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeDomain = initialDomain ? LEGAL_DOMAIN_MAP[initialDomain] : undefined

  // Initialiser depuis URL d'abord, puis props
  const initQuery = searchParams.get('q') || initialQuery || ''
  const initCat = searchParams.get('cat') || initialCategory || undefined
  const initNl = (searchParams.get('nl') as NormLevel) || undefined
  const initTribunal = searchParams.get('tribunal') || undefined
  const initLang = (searchParams.get('lang') as 'fr' | 'ar' | 'bi') || undefined
  const initSort = (searchParams.get('sort') as SortField) || 'relevance'
  const initOrder = (searchParams.get('order') as SortOrder) || 'desc'
  const initView = (searchParams.get('view') as ViewMode) || 'list'
  const initDomain = searchParams.get('domain_filter') || undefined
  const initDateFrom = searchParams.get('df') || undefined
  const initDateTo = searchParams.get('dt') || undefined

  const [searchQuery, setSearchQuery] = useState(initQuery)
  const [filters, setFilters] = useState<DocumentFilters>({
    category: initCat,
    normLevel: initNl,
    tribunal: initTribunal,
    language: initLang,
    domain: initDomain,
    dateFrom: initDateFrom,
    dateTo: initDateTo,
  })
  const [activeDocType] = useState<string | undefined>(initialDocType)
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>(initView)
  const [sortField, setSortField] = useState<SortField>(initSort)
  const [sortOrder, setSortOrder] = useState<SortOrder>(initOrder)
  const [selectedDocument, setSelectedDocument] = useState<SearchResultItem | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [displayedCount, setDisplayedCount] = useState(20)
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null)

  // Refs pour éviter doubles effets
  const isMounted = useRef(false)

  // Browse mode: category OR norm_level OR docType selected but no search query
  const isBrowseMode = !searchQuery.trim() && (!!filters.category || !!filters.normLevel || !!activeDocType)
  const browseSort = sortField === 'title' ? 'title' as const : 'date' as const

  const {
    data: browseData,
    isLoading: isBrowseLoading,
    isError: isBrowseError,
    error: browseError,
  } = useKBBrowse({
    category: filters.category,
    normLevel: filters.normLevel,
    docType: activeDocType,
    limit: 100,
    offset: 0,
    sort: browseSort,
    enabled: isBrowseMode,
  })

  useEffect(() => {
    if (isBrowseMode && browseData?.results) {
      const items: SearchResultItem[] = browseData.results.map((r) => ({
        kbId: r.kbId,
        title: r.title,
        category: r.category,
        normLevel: r.normLevel,
        docType: r.docType,
        updatedAt: r.updatedAt,
        similarity: null,
        metadata: r.metadata as SearchResultItem['metadata'],
      }))
      setResults(items)
      setHasSearched(true)
      setDisplayedCount(20)
      setProcessingTimeMs(null)
      setError(null)
    }
    if (isBrowseMode && isBrowseError && browseError) {
      setError((browseError as Error).message || 'Erreur lors du chargement')
      setHasSearched(true)
    }
  }, [isBrowseMode, browseData, isBrowseError, browseError])

  const { mutate: search, isPending: isSearchLoading } = useRAGSearchMutation({
    onSuccess: (data: APISearchResult) => {
      const items = (data.results || []) as SearchResultItem[]
      setResults(items)
      setError(null)
      setHasSearched(true)
      setDisplayedCount(20)
      setProcessingTimeMs(data.metadata?.processingTimeMs ?? null)
    },
    onError: (err: Error) => {
      setError(err.message || 'Erreur lors de la recherche')
      setHasSearched(true)
    },
  })

  const isLoading = isBrowseMode ? isBrowseLoading : isSearchLoading

  // Sauvegarde récente via callback
  const saveRecentRef = useRef<((q: string) => void) | null>(null)

  const handleSearch = useCallback(() => {
    const query = searchQuery.trim()
    const hasFilter = !!filters.category || !!filters.normLevel

    if (!query && !hasFilter) return
    if (!query && hasFilter) return

    // Sauvegarder dans l'historique
    if (query && saveRecentRef.current) {
      saveRecentRef.current(query)
    }

    // Mettre à jour l'URL
    const qs = buildParams(searchParams, {
      q: query,
      cat: filters.category,
      nl: filters.normLevel,
      tribunal: filters.tribunal,
      lang: filters.language,
      domain_filter: filters.domain,
      df: filters.dateFrom,
      dt: filters.dateTo,
      sort: sortField !== 'relevance' ? sortField : undefined,
      order: sortOrder !== 'desc' ? sortOrder : undefined,
    })
    router.replace(`?${qs}`)

    setError(null)
    search({
      question: query,
      filters: {
        category: filters.category,
        domain: filters.domain,
        tribunal: filters.tribunal,
        chambre: filters.chambre,
        language: filters.language,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      },
      limit: 50,
      includeRelations: true,
      sortBy: sortField !== 'title' ? sortField : undefined,
    })
  }, [searchQuery, filters, search, sortField, sortOrder, searchParams, router])

  // Auto-search on initial category/query
  const [initialSearchDone, setInitialSearchDone] = useState(false)
  useEffect(() => {
    if (!initialSearchDone && (initialCategory || initialQuery)) {
      setInitialSearchDone(true)
      if (initialQuery) {
        handleSearch()
      }
    }
  }, [initialSearchDone, initialCategory, initialQuery, handleSearch])

  // Sync viewMode + sortField to URL
  useEffect(() => {
    if (!isMounted.current) {
      isMounted.current = true
      return
    }
    const qs = buildParams(searchParams, {
      view: viewMode !== 'list' ? viewMode : undefined,
      sort: sortField !== 'relevance' ? sortField : undefined,
      order: sortOrder !== 'desc' ? sortOrder : undefined,
    })
    router.replace(`?${qs}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, sortField, sortOrder])

  const handleFilterChange = (key: keyof DocumentFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const removeFilter = (key: keyof DocumentFilters) => {
    setFilters(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const clearFilters = () => {
    setFilters({})
  }

  // Date range helpers
  const parseDateField = (isoStr: string | undefined): { year: string; month: string } => {
    if (!isoStr) return { year: '', month: '' }
    const d = new Date(isoStr)
    return {
      year: String(d.getFullYear()),
      month: String(d.getMonth() + 1),
    }
  }

  const buildDateISO = (year: string, month: string, endOfMonth = false): string | undefined => {
    if (!year) return undefined
    const y = parseInt(year)
    const m = month ? parseInt(month) - 1 : endOfMonth ? 11 : 0
    const d = endOfMonth
      ? new Date(y, m + 1, 0)
      : new Date(y, m, 1)
    return d.toISOString().split('T')[0]
  }

  const dateFromParsed = parseDateField(filters.dateFrom)
  const dateToParsed = parseDateField(filters.dateTo)

  // Tri des résultats
  const sortedResults = [...results].sort((a, b) => {
    let comparison = 0
    switch (sortField) {
      case 'relevance':
        comparison = (b.similarity ?? 0) - (a.similarity ?? 0)
        break
      case 'date': {
        const dateA = a.metadata.decisionDate ? new Date(a.metadata.decisionDate).getTime() : 0
        const dateB = b.metadata.decisionDate ? new Date(b.metadata.decisionDate).getTime() : 0
        comparison = dateB - dateA
        break
      }
      case 'title':
        comparison = a.title.localeCompare(b.title)
        break
      case 'citations': {
        const citA = a.metadata.citedByCount || 0
        const citB = b.metadata.citedByCount || 0
        comparison = citB - citA
        break
      }
    }
    return sortOrder === 'asc' ? -comparison : comparison
  })

  const displayedResults = sortedResults.slice(0, displayedCount)
  const hasMore = sortedResults.length > displayedCount

  const activeFiltersCount = Object.values(filters).filter(v => v !== undefined && v !== '').length

  const handleBreadcrumbCategory = useCallback(() => {
    setSearchQuery('')
    handleSearch()
  }, [handleSearch])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Breadcrumb */}
      {(hasSearched || filters.category || activeDomain) && (
        <nav className="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            onClick={onBack}
            className="hover:text-foreground transition-colors"
          >
            {activeDocType === 'TEXTES' ? 'Textes Juridiques' : 'Base de Connaissances'}
          </button>
          {activeDomain && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{activeDomain.labelFr}</span>
            </>
          )}
          {filters.category && !activeDomain && (
            <>
              <ChevronRight className="h-3 w-3" />
              <button
                onClick={handleBreadcrumbCategory}
                className="hover:text-foreground transition-colors"
              >
                {getCategoryLabel(filters.category)}
              </button>
            </>
          )}
          {searchQuery.trim() && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">&ldquo;{searchQuery.trim()}&rdquo;</span>
            </>
          )}
        </nav>
      )}

      {/* Barre de recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans la base de connaissances..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSearch()}
                className="pl-10"
              />
            </div>

            {/* Historique récent */}
            <RecentSearchesDropdown
              onSelect={(q) => {
                setSearchQuery(q)
                setTimeout(() => handleSearch(), 0)
              }}
              registerSave={(fn) => { saveRecentRef.current = fn }}
            />

            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recherche...
                </>
              ) : (
                'Rechercher'
              )}
            </Button>

            {/* Filtres — desktop toggle */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="hidden md:flex"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {/* Filtres — mobile Sheet */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="md:hidden">
                  <Filter className="h-4 w-4 mr-2" />
                  Filtres
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filtres avancés</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FilterPanelContent
                    filters={filters}
                    activeDocType={activeDocType}
                    onFilterChange={handleFilterChange}
                    onClearFilters={clearFilters}
                    onApply={handleSearch}
                    dateFromParsed={dateFromParsed}
                    dateToParsed={dateToParsed}
                    buildDateISO={buildDateISO}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          {/* Filtres avancés — desktop uniquement */}
          {showFilters && (
            <div className="hidden md:block mt-4 pt-4 border-t">
              <FilterPanelContent
                filters={filters}
                activeDocType={activeDocType}
                onFilterChange={handleFilterChange}
                onClearFilters={clearFilters}
                onApply={handleSearch}
                dateFromParsed={dateFromParsed}
                dateToParsed={dateToParsed}
                buildDateISO={buildDateISO}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Barre de filtres actifs (quand panel fermé) */}
      {!showFilters && activeFiltersCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filters.category && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('category')}>
              {getCategoryLabel(filters.category)}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.normLevel && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('normLevel')}>
              <Scale className="h-3 w-3" />
              {getNormLevelLabel(filters.normLevel, 'fr')}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.domain && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('domain')}>
              {LEGAL_DOMAINS.find(d => d.id === filters.domain)?.labelFr || filters.domain}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.tribunal && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('tribunal')}>
              {TRIBUNAL_LABELS[filters.tribunal] || filters.tribunal}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.language && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('language')}>
              {LANGUAGE_LABELS[filters.language]}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('dateFrom')}>
              Depuis {new Date(filters.dateFrom).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
              <X className="h-3 w-3" />
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeFilter('dateTo')}>
              Jusqu&apos;à {new Date(filters.dateTo).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}
              <X className="h-3 w-3" />
            </Badge>
          )}
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Effacer tout
          </button>
        </div>
      )}

      {/* Erreur */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Toolbar */}
      {hasSearched && !isLoading && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {isBrowseMode && browseData?.pagination
              ? `${browseData.pagination.total} documents`
              : `${results.length} ${results.length === 1 ? 'résultat' : 'résultats'}`}
            {processingTimeMs != null && (
              <span className="ml-1">({(processingTimeMs / 1000).toFixed(1)}s)</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SortAsc className="h-4 w-4 mr-2" />
                  Trier
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Trier par</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={sortField === 'relevance'}
                  onCheckedChange={() => setSortField('relevance')}
                >
                  Pertinence
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={sortField === 'date'}
                  onCheckedChange={() => setSortField('date')}
                >
                  Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={sortField === 'title'}
                  onCheckedChange={() => setSortField('title')}
                >
                  Titre
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={sortField === 'citations'}
                  onCheckedChange={() => setSortField('citations')}
                >
                  Citations
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={sortOrder === 'desc'}
                  onCheckedChange={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  Ordre décroissant
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex gap-1 border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="rounded-r-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="rounded-l-none"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Skeleton loading */}
      {isLoading && (
        viewMode === 'list' ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-14 rounded-full" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20 rounded-full" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}

      {/* État vide */}
      {!isLoading && hasSearched && results.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center space-y-4">
            <Search className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Aucun résultat trouvé.</p>
            <div className="flex flex-col items-center gap-2">
              {filters.category && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    removeFilter('category')
                    setTimeout(handleSearch, 0)
                  }}
                >
                  Rechercher dans toutes les catégories
                </Button>
              )}
              {searchQuery.trim().length > 30 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lightbulb className="h-4 w-4" />
                  <span>Essayez des termes plus généraux</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && displayedResults.length > 0 && (
        <>
          <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
            {displayedResults.map((document) => (
              <DocumentCard
                key={document.kbId}
                document={document}
                viewMode={viewMode}
                onClick={() => setSelectedDocument(document)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={() => setDisplayedCount(prev => prev + 20)}
              >
                Charger plus ({sortedResults.length - displayedCount} restants)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Modal détail document */}
      {selectedDocument && (
        <DocumentDetailModal
          document={selectedDocument}
          open={!!selectedDocument}
          onOpenChange={(open) => !open && setSelectedDocument(null)}
        />
      )}
    </div>
  )
}

// =============================================================================
// FILTER PANEL CONTENT (réutilisé desktop + mobile Sheet)
// =============================================================================

interface FilterPanelContentProps {
  filters: DocumentFilters
  activeDocType?: string
  onFilterChange: (key: keyof DocumentFilters, value: unknown) => void
  onClearFilters: () => void
  onApply: () => void
  dateFromParsed: { year: string; month: string }
  dateToParsed: { year: string; month: string }
  buildDateISO: (year: string, month: string, endOfMonth: boolean) => string | undefined
}

function FilterPanelContent({
  filters,
  activeDocType,
  onFilterChange,
  onClearFilters,
  onApply,
  dateFromParsed,
  dateToParsed,
  buildDateISO,
}: FilterPanelContentProps) {
  return (
    <div className="space-y-3">
      {/* Rangée 1 : Catégorie + Niveau normatif */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select
          value={filters.category}
          onValueChange={(value) => onFilterChange('category', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Catégorie" />
          </SelectTrigger>
          <SelectContent>
            {getCategoriesForContext('knowledge_base', 'fr').map(cat => (
              <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.normLevel}
          onValueChange={(value) => onFilterChange('normLevel', value as NormLevel)}
        >
          <SelectTrigger>
            <Scale className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Niveau normatif" />
          </SelectTrigger>
          <SelectContent>
            {NORM_LEVELS_ORDERED.map(level => (
              <SelectItem key={level.value} value={level.value}>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{level.order}</span>
                  {level.labelFr}
                  <span className="text-xs text-muted-foreground">{level.labelAr}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rangée 2 : Domaine + Langue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select
          value={filters.domain}
          onValueChange={(value) => onFilterChange('domain', value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Domaine juridique" />
          </SelectTrigger>
          <SelectContent>
            {LEGAL_DOMAINS.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.labelFr}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.language}
          onValueChange={(value) => onFilterChange('language', value as 'fr' | 'ar' | 'bi')}
        >
          <SelectTrigger>
            <SelectValue placeholder="Langue" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">Français</SelectItem>
            <SelectItem value="ar">Arabe</SelectItem>
            <SelectItem value="bi">Bilingue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Rangée 3 : Tribunal + Chambre (caché si TEXTES) */}
      {activeDocType !== 'TEXTES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            value={filters.tribunal}
            onValueChange={(value) => onFilterChange('tribunal', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tribunal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TRIBUNAL_CASSATION">Cour de Cassation</SelectItem>
              <SelectItem value="COUR_APPEL">Cour d&apos;appel</SelectItem>
              <SelectItem value="TRIBUNAL_PREMIERE_INSTANCE">Tribunal de première instance</SelectItem>
              <SelectItem value="TRIBUNAL_ADMINISTRATIF">Tribunal administratif</SelectItem>
              <SelectItem value="TRIBUNAL_IMMOBILIER">Tribunal immobilier</SelectItem>
              <SelectItem value="TRIBUNAL_MILITAIRE">Tribunal militaire</SelectItem>
              <SelectItem value="TRIBUNAL_CANTONAL">Justice cantonale</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.chambre}
            onValueChange={(value) => onFilterChange('chambre', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chambre" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="civile">Chambre civile</SelectItem>
              <SelectItem value="penale">Chambre pénale</SelectItem>
              <SelectItem value="commerciale">Chambre commerciale</SelectItem>
              <SelectItem value="sociale">Chambre sociale</SelectItem>
              <SelectItem value="administrative">Chambre administrative</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Rangée 4 : Date range */}
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground font-medium">Période</p>
        <div className="grid grid-cols-2 gap-3">
          {/* De */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">De</span>
            <Select
              value={dateFromParsed.year}
              onValueChange={(y) => {
                const iso = buildDateISO(y, dateFromParsed.month, false)
                onFilterChange('dateFrom', iso)
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Année" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dateFromParsed.month}
              onValueChange={(m) => {
                const iso = buildDateISO(dateFromParsed.year, m, false)
                onFilterChange('dateFrom', iso)
              }}
              disabled={!dateFromParsed.year}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_FR.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* À */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">À</span>
            <Select
              value={dateToParsed.year}
              onValueChange={(y) => {
                const iso = buildDateISO(y, dateToParsed.month, true)
                onFilterChange('dateTo', iso)
              }}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Année" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={dateToParsed.month}
              onValueChange={(m) => {
                const iso = buildDateISO(dateToParsed.year, m, true)
                onFilterChange('dateTo', iso)
              }}
              disabled={!dateToParsed.year}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_FR.map((name, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClearFilters}>
          Effacer filtres
        </Button>
        <Button size="sm" onClick={onApply}>
          Appliquer
        </Button>
      </div>
    </div>
  )
}
