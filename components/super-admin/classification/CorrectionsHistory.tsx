'use client'

/**
 * Composant: CorrectionsHistory
 *
 * Historique des corrections de classification avec impact
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, ExternalLink, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

// =============================================================================
// TYPES
// =============================================================================

interface CorrectionHistoryItem {
  id: string
  pageUrl: string
  pageTitle: string | null
  sourceName: string
  originalCategory: string
  originalDomain: string
  correctedCategory: string
  correctedDomain: string | null
  correctedBy: string
  createdAt: string
  hasGeneratedRule: boolean
  ruleName: string | null
  pagesAffected: number | null
}

interface CorrectionsHistoryResponse {
  items: CorrectionHistoryItem[]
  total: number
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CorrectionsHistory() {
  const [hasRuleFilter, setHasRuleFilter] = useState<'all' | 'true' | 'false'>('all')
  const [page, setPage] = useState(0)
  const limit = 50

  const { data, isLoading, error } = useQuery<CorrectionsHistoryResponse>({
    queryKey: ['classification-corrections', hasRuleFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      })

      if (hasRuleFilter !== 'all') {
        params.append('hasRule', hasRuleFilter)
      }

      const response = await fetch(`/api/super-admin/classification/corrections?${params}`)
      if (!response.ok) {
        throw new Error('Erreur lors du chargement de l\'historique')
      }
      return response.json()
    },
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-end gap-4">
        <div className="w-[200px]">
          <Label htmlFor="rule-filter">Règle générée</Label>
          <Select value={hasRuleFilter} onValueChange={(val) => {
            setHasRuleFilter(val as typeof hasRuleFilter)
            setPage(0)
          }}>
            <SelectTrigger id="rule-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              <SelectItem value="true">✨ Avec règle</SelectItem>
              <SelectItem value="false">Sans règle</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        <div className="text-sm text-muted-foreground">
          {data?.total || 0} corrections totales
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
            Erreur lors du chargement de l'historique
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Aucune correction enregistrée
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Page</TableHead>
                <TableHead>Original → Corrigé</TableHead>
                <TableHead>Par</TableHead>
                <TableHead>Impact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDistanceToNow(new Date(item.createdAt), {
                      addSuffix: true,
                      locale: fr,
                    })}
                  </TableCell>

                  <TableCell className="max-w-[300px]">
                    <div className="space-y-1">
                      <div className="font-medium truncate" title={item.pageTitle || item.pageUrl}>
                        {item.pageTitle || 'Sans titre'}
                      </div>
                      <a
                        href={item.pageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {item.sourceName}
                      </a>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-gray-100 text-gray-800">
                          {item.originalCategory}
                        </Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="outline" className="bg-green-100 text-green-800">
                          {item.correctedCategory}
                        </Badge>
                      </div>
                      {item.originalDomain !== item.correctedDomain && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">{item.originalDomain}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-muted-foreground">{item.correctedDomain}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {item.correctedBy}
                  </TableCell>

                  <TableCell>
                    {item.hasGeneratedRule ? (
                      <div className="space-y-1">
                        <Badge className="bg-green-100 text-green-800 gap-1">
                          <Sparkles className="h-3 w-3" />
                          Règle générée
                        </Badge>
                        {item.pagesAffected !== null && (
                          <div className="text-xs text-muted-foreground">
                            {item.pagesAffected} pages affectées
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {data && data.items.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Affichage de {page * limit + 1} à {Math.min((page + 1) * limit, data.total)} sur{' '}
            {data.total} corrections
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
              disabled={(page + 1) * limit >= data.total}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
