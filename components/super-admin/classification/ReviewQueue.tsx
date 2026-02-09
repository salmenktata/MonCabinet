'use client'

/**
 * Composant: ReviewQueue
 *
 * Table des pages nécessitant revue humaine avec filtres et actions
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ExternalLink, Eye } from 'lucide-react'
import { ReviewModal } from './ReviewModal'
import type { ReviewPriority, ReviewEffort } from '@/lib/web-scraper/legal-classifier-service'

// =============================================================================
// TYPES
// =============================================================================

interface ReviewQueueItem {
  webPageId: string
  url: string
  title: string | null
  primaryCategory: string
  domain: string
  confidenceScore: number
  reviewPriority: ReviewPriority | null
  reviewEstimatedEffort: ReviewEffort | null
  validationReason: string | null
  sourceName: string
  createdAt: string
}

interface ReviewQueueResponse {
  items: ReviewQueueItem[]
  total: number
  stats: {
    total: number
    urgent: number
    high: number
    medium: number
    low: number
    noPriority: number
  }
}

interface Filters {
  priority: ReviewPriority[]
  effort: ReviewEffort[]
  search: string
}

// =============================================================================
// HELPERS
// =============================================================================

function getPriorityBadge(priority: ReviewPriority | null) {
  if (!priority) {
    return <Badge variant="outline" className="bg-gray-100 text-gray-800">Aucune</Badge>
  }

  const variants: Record<ReviewPriority, { bg: string; text: string; label: string }> = {
    urgent: { bg: 'bg-red-100', text: 'text-red-800', label: '🔴 Urgent' },
    high: { bg: 'bg-orange-100', text: 'text-orange-800', label: '🟠 High' },
    medium: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '🟡 Medium' },
    low: { bg: 'bg-green-100', text: 'text-green-800', label: '🟢 Low' },
  }

  const variant = variants[priority]
  return (
    <Badge variant="outline" className={`${variant.bg} ${variant.text}`}>
      {variant.label}
    </Badge>
  )
}

function getEffortBadge(effort: ReviewEffort | null) {
  if (!effort) return null

  const variants: Record<ReviewEffort, { bg: string; text: string; label: string }> = {
    quick: { bg: 'bg-blue-100', text: 'text-blue-800', label: '⚡ Quick' },
    moderate: { bg: 'bg-purple-100', text: 'text-purple-800', label: '⏱️ Moderate' },
    complex: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: '🧠 Complex' },
  }

  const variant = variants[effort]
  return (
    <Badge variant="outline" className={`${variant.bg} ${variant.text}`}>
      {variant.label}
    </Badge>
  )
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ReviewQueue() {
  const [filters, setFilters] = useState<Filters>({
    priority: [],
    effort: [],
    search: '',
  })

  const [page, setPage] = useState(0)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const limit = 50

  // Fetch queue data
  const { data, isLoading, error, refetch } = useQuery<ReviewQueueResponse>({
    queryKey: ['classification-queue', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })

      // Ajouter filtres priority
      filters.priority.forEach(p => {
        params.append('priority[]', p)
      })

      // Ajouter filtres effort
      filters.effort.forEach(e => {
        params.append('effort[]', e)
      })

      const response = await fetch(`/api/super-admin/classification/queue?${params}`)
      if (!response.ok) {
        throw new Error('Erreur lors du chargement de la queue')
      }
      return response.json()
    },
  })

  // Filtrer localement par search (titre/URL)
  const filteredItems = data?.items.filter(item => {
    if (!filters.search) return true
    const searchLower = filters.search.toLowerCase()
    return (
      item.url.toLowerCase().includes(searchLower) ||
      item.title?.toLowerCase().includes(searchLower) ||
      item.sourceName.toLowerCase().includes(searchLower)
    )
  })

  // Handlers
  const handlePriorityFilterChange = (value: string) => {
    if (value === 'all') {
      setFilters(prev => ({ ...prev, priority: [] }))
    } else {
      setFilters(prev => ({ ...prev, priority: [value as ReviewPriority] }))
    }
    setPage(0)
  }

  const handleEffortFilterChange = (value: string) => {
    if (value === 'all') {
      setFilters(prev => ({ ...prev, effort: [] }))
    } else {
      setFilters(prev => ({ ...prev, effort: [value as ReviewEffort] }))
    }
    setPage(0)
  }

  const handleReviewComplete = () => {
    setSelectedPageId(null)
    refetch()
  }

  return (
    <div className="space-y-4">
      {/* Stats Header */}
      {data?.stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-50 p-3 rounded-lg border">
            <div className="text-sm text-gray-600">Total</div>
            <div className="text-2xl font-bold">{data.stats.total}</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <div className="text-sm text-red-600">Urgent</div>
            <div className="text-2xl font-bold text-red-700">{data.stats.urgent}</div>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
            <div className="text-sm text-orange-600">High</div>
            <div className="text-2xl font-bold text-orange-700">{data.stats.high}</div>
          </div>
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <div className="text-sm text-yellow-600">Medium</div>
            <div className="text-2xl font-bold text-yellow-700">{data.stats.medium}</div>
          </div>
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <div className="text-sm text-green-600">Low</div>
            <div className="text-2xl font-bold text-green-700">{data.stats.low}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="search">Rechercher</Label>
          <Input
            id="search"
            placeholder="URL, titre, source..."
            value={filters.search}
            onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>

        <div className="w-[180px]">
          <Label htmlFor="priority-filter">Priorité</Label>
          <Select
            value={filters.priority[0] || 'all'}
            onValueChange={handlePriorityFilterChange}
          >
            <SelectTrigger id="priority-filter">
              <SelectValue placeholder="Toutes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="urgent">🔴 Urgent</SelectItem>
              <SelectItem value="high">🟠 High</SelectItem>
              <SelectItem value="medium">🟡 Medium</SelectItem>
              <SelectItem value="low">🟢 Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-[180px]">
          <Label htmlFor="effort-filter">Effort</Label>
          <Select value={filters.effort[0] || 'all'} onValueChange={handleEffortFilterChange}>
            <SelectTrigger id="effort-filter">
              <SelectValue placeholder="Tous" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="quick">⚡ Quick</SelectItem>
              <SelectItem value="moderate">⏱️ Moderate</SelectItem>
              <SelectItem value="complex">🧠 Complex</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-12 text-red-600">
            Erreur lors du chargement de la queue
          </div>
        ) : !filteredItems || filteredItems.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Aucune page à revoir 🎉
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Priorité</TableHead>
                <TableHead>Effort</TableHead>
                <TableHead>Confiance</TableHead>
                <TableHead>Raison</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map(item => (
                <TableRow key={item.webPageId}>
                  <TableCell className="max-w-[400px]">
                    <div className="space-y-1">
                      <div className="font-medium truncate" title={item.title || item.url}>
                        {item.title || item.url}
                      </div>
                      <div className="flex items-center gap-2">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {new URL(item.url).hostname}
                        </a>
                        <span className="text-xs text-muted-foreground">
                          {item.sourceName}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getPriorityBadge(item.reviewPriority)}</TableCell>
                  <TableCell>{getEffortBadge(item.reviewEstimatedEffort)}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        item.confidenceScore >= 0.7
                          ? 'bg-green-100 text-green-800'
                          : item.confidenceScore >= 0.5
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-red-100 text-red-800'
                      }
                    >
                      {(item.confidenceScore * 100).toFixed(0)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px]">
                    <span className="text-sm text-muted-foreground truncate block" title={item.validationReason || undefined}>
                      {item.validationReason || '-'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => setSelectedPageId(item.webPageId)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Réviser
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {filteredItems && filteredItems.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Affichage de {page * limit + 1} à {Math.min((page + 1) * limit, data?.total || 0)} sur{' '}
            {data?.total || 0} pages
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!data || (page + 1) * limit >= data.total}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selectedPageId && (
        <ReviewModal
          pageId={selectedPageId}
          onClose={() => setSelectedPageId(null)}
          onComplete={handleReviewComplete}
        />
      )}
    </div>
  )
}
