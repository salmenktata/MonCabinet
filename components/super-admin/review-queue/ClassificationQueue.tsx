/**
 * Queue de Classification Automatique
 * Wrapper autour de l'ancien ReviewQueue de classification
 */

'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Search, AlertCircle } from 'lucide-react'
import { ReviewModal } from '@/components/super-admin/classification/ReviewModal'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-green-100 text-green-800',
}

const EFFORT_COLORS: Record<string, string> = {
  quick: 'bg-green-100 text-green-800',
  moderate: 'bg-yellow-100 text-yellow-800',
  complex: 'bg-red-100 text-red-800',
}

export function ClassificationQueue() {
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    priority: [] as string[],
    effort: [] as string[],
    search: '',
  })
  const [page, setPage] = useState(1)
  const limit = 20

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['classification-queue', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      })

      filters.priority.forEach((p) => params.append('priority[]', p))
      filters.effort.forEach((e) => params.append('effort[]', e))

      const response = await fetch(`/api/super-admin/classification/queue?${params}`)
      if (!response.ok) throw new Error('Failed to fetch queue')
      return response.json()
    },
  })

  const filteredItems =
    data?.items.filter((item: any) => {
      if (!filters.search) return true
      const search = filters.search.toLowerCase()
      return (
        item.url.toLowerCase().includes(search) ||
        item.title?.toLowerCase().includes(search) ||
        item.source_name.toLowerCase().includes(search)
      )
    }) || []

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Urgent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data?.stats.urgent || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Haute</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{data?.stats.high || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Moyenne</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{data?.stats.medium || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Basse</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data?.stats.low || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.total || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-9"
                />
              </div>
            </div>

            <Select
              value={filters.priority[0] || 'all'}
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  priority: value === 'all' ? [] : [value],
                })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.effort[0] || 'all'}
              onValueChange={(value) =>
                setFilters({
                  ...filters,
                  effort: value === 'all' ? [] : [value],
                })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Effort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="quick">Rapide</SelectItem>
                <SelectItem value="moderate">Modéré</SelectItem>
                <SelectItem value="complex">Complexe</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-6 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Erreur: {error instanceof Error ? error.message : 'Erreur inconnue'}</span>
            </div>
          )}

          {data && filteredItems.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">Aucune page à revoir</div>
          )}

          {data && filteredItems.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Page</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-center">Priorité</TableHead>
                  <TableHead className="text-center">Effort</TableHead>
                  <TableHead className="text-center">Confiance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item: any) => (
                  <TableRow key={item.web_page_id}>
                    <TableCell>
                      <div className="max-w-xs">
                        <div className="font-medium truncate">{item.title || 'Sans titre'}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.url}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{item.primary_category}</div>
                        {item.domain && (
                          <div className="text-xs text-muted-foreground">{item.domain}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.review_priority && (
                        <Badge className={PRIORITY_COLORS[item.review_priority]}>
                          {item.review_priority}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.review_estimated_effort && (
                        <Badge className={EFFORT_COLORS[item.review_estimated_effort]}>
                          {item.review_estimated_effort}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{Math.round(item.confidence_score * 100)}%</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setSelectedPageId(item.web_page_id)}>
                        Réviser
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page} sur {totalPages} ({data.total} résultats)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
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
          isOpen={!!selectedPageId}
          onClose={() => setSelectedPageId(null)}
          onComplete={() => {
            setSelectedPageId(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}
