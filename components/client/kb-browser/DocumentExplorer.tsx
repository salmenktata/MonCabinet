'use client'

/**
 * Composant DocumentExplorer - Sprint 4 / Sprint 6
 *
 * Explorateur de la Knowledge Base avec :
 * - Recherche full-text + sémantique (React Query cache)
 * - Filtres avancés (catégorie, tribunal, chambre, date)
 * - Vue liste/grille
 * - Tri et pagination
 * - Modal détail document avec relations juridiques
 */

import { useState } from 'react'
import { Search, Filter, Grid3x3, List, SortAsc, ChevronDown, BookOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { useRAGSearchMutation } from '@/lib/hooks/useRAGSearch'
import type { RAGSearchResult } from '@/lib/ai/unified-rag-service'

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentExplorerProps {
  /** @deprecated onSearch prop is no longer used - component now uses React Query internally */
  onSearch?: (query: string, filters: DocumentFilters) => Promise<RAGSearchResult[]>
  initialResults?: RAGSearchResult[]
  className?: string
}

export interface DocumentFilters {
  category?: string
  domain?: string
  tribunal?: string
  chambre?: string
  language?: 'fr' | 'ar' | 'bi'
  dateFrom?: Date
  dateTo?: Date
}

type ViewMode = 'list' | 'grid'
type SortField = 'relevance' | 'date' | 'title' | 'citations'
type SortOrder = 'asc' | 'desc'

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function DocumentExplorer({
  initialResults = [],
  className = '',
}: DocumentExplorerProps) {
  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<DocumentFilters>({})
  const [results, setResults] = useState<RAGSearchResult[]>(initialResults)
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [sortField, setSortField] = useState<SortField>('relevance')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [selectedDocument, setSelectedDocument] = useState<RAGSearchResult | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  // React Query mutation for search
  const { mutate: search, isPending: isLoading } = useRAGSearchMutation({
    onSuccess: (data) => {
      setResults(data.results)
    },
    onError: (error) => {
      console.error('Erreur recherche:', error)
    },
  })

  // Handlers
  const handleSearch = () => {
    if (!searchQuery.trim()) return

    search({
      question: searchQuery,
      filters: {
        category: filters.category,
        domain: filters.domain,
        tribunal: filters.tribunal,
        chambre: filters.chambre,
        language: filters.language,
      },
      limit: 50,
      includeRelations: true,
    })
  }

  const handleFilterChange = (key: keyof DocumentFilters, value: unknown) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({})
  }

  // Tri des résultats
  const sortedResults = [...results].sort((a, b) => {
    let comparison = 0

    switch (sortField) {
      case 'relevance':
        comparison = b.similarity - a.similarity
        break
      case 'date':
        const dateA = a.metadata.decisionDate?.getTime() || 0
        const dateB = b.metadata.decisionDate?.getTime() || 0
        comparison = dateB - dateA
        break
      case 'title':
        comparison = a.title.localeCompare(b.title)
        break
      case 'citations':
        const citationsA = a.metadata.citedByCount || 0
        const citationsB = b.metadata.citedByCount || 0
        comparison = citationsB - citationsA
        break
    }

    return sortOrder === 'asc' ? -comparison : comparison
  })

  // Filtres actifs count
  const activeFiltersCount = Object.values(filters).filter(v => v !== undefined).length

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Barre de recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans la base de connaissances..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10"
              />
            </div>

            <Button onClick={handleSearch} disabled={isLoading}>
              {isLoading ? 'Recherche...' : 'Rechercher'}
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtres
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </div>

          {/* Filtres avancés */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  value={filters.category}
                  onValueChange={(value) => handleFilterChange('category', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jurisprudence">Jurisprudence</SelectItem>
                    <SelectItem value="codes">Codes</SelectItem>
                    <SelectItem value="legislation">Législation</SelectItem>
                    <SelectItem value="doctrine">Doctrine</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.tribunal}
                  onValueChange={(value) => handleFilterChange('tribunal', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tribunal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIBUNAL_CASSATION">Cassation</SelectItem>
                    <SelectItem value="TRIBUNAL_APPEL">Appel</SelectItem>
                    <SelectItem value="TRIBUNAL_PREMIERE_INSTANCE">Première Instance</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.language}
                  onValueChange={(value) => handleFilterChange('language', value as 'fr' | 'ar' | 'bi')}
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

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Effacer filtres
                </Button>
                <Button size="sm" onClick={handleSearch}>
                  Appliquer
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {results.length} {results.length === 1 ? 'résultat' : 'résultats'}
        </div>

        <div className="flex items-center gap-2">
          {/* Tri */}
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

          {/* Vue */}
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

      {/* Résultats */}
      {results.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {searchQuery
                ? 'Aucun résultat trouvé. Essayez avec d\'autres termes.'
                : 'Lancez une recherche pour explorer la base de connaissances.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
          {sortedResults.map((document) => (
            <DocumentCard
              key={document.kbId}
              document={document}
              viewMode={viewMode}
              onClick={() => setSelectedDocument(document)}
            />
          ))}
        </div>
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
// COMPOSANT DOCUMENT CARD
// =============================================================================

interface DocumentCardProps {
  document: RAGSearchResult
  viewMode: ViewMode
  onClick: () => void
}

function DocumentCard({ document, viewMode, onClick }: DocumentCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm line-clamp-2 flex-1">
              {document.title}
            </h3>

            <Badge variant="outline" className="shrink-0">
              {Math.round(document.similarity * 100)}%
            </Badge>
          </div>

          {/* Métadonnées */}
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary" className="text-xs">
              {document.category}
            </Badge>

            {document.metadata.tribunalLabelFr && (
              <Badge variant="outline" className="text-xs">
                {document.metadata.tribunalLabelFr}
              </Badge>
            )}

            {document.metadata.decisionDate && (
              <Badge variant="outline" className="text-xs">
                {document.metadata.decisionDate.toLocaleDateString('fr-FR')}
              </Badge>
            )}

            {document.metadata.citedByCount && document.metadata.citedByCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {document.metadata.citedByCount} citations
              </Badge>
            )}
          </div>

          {/* Extrait */}
          {viewMode === 'list' && document.chunkContent && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {document.chunkContent}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
