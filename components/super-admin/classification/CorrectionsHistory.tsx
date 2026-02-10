'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Loader2, AlertCircle, ArrowRight, Sparkles } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

export function CorrectionsHistory() {
  const [hasRuleFilter, setHasRuleFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const limit = 20

  const { data, isLoading, error } = useQuery({
    queryKey: ['classification-corrections', hasRuleFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: ((page - 1) * limit).toString(),
      })

      if (hasRuleFilter !== 'all') {
        params.append('hasRule', hasRuleFilter)
      }

      const response = await fetch(`/api/super-admin/classification/corrections?${params}`)
      if (!response.ok) throw new Error('Failed to fetch corrections')
      return response.json()
    },
  })

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  return (
    <div className="space-y-6">
      {/* Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">Filtrer par:</span>
            <Select value={hasRuleFilter} onValueChange={setHasRuleFilter}>
              <SelectTrigger className="w-[250px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les corrections</SelectItem>
                <SelectItem value="true">Avec règle générée</SelectItem>
                <SelectItem value="false">Sans règle générée</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto text-sm text-muted-foreground">
              {data?.total || 0} correction(s)
            </div>
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

          {data && data.items.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">Aucune correction</div>
          )}

          {data && data.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead>Corrigé par</TableHead>
                  <TableHead>Impact</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(item.created_at), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="max-w-xs">
                        <div className="font-medium truncate">{item.page_title || 'Sans titre'}</div>
                        <div className="text-xs text-muted-foreground truncate">{item.page_url}</div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <div>
                          <div className="font-medium">{item.original_category}</div>
                          {item.original_domain && (
                            <div className="text-xs text-muted-foreground">{item.original_domain}</div>
                          )}
                        </div>

                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                        <div>
                          <div className="font-medium text-green-600">{item.corrected_category}</div>
                          {item.corrected_domain && (
                            <div className="text-xs text-green-600/70">{item.corrected_domain}</div>
                          )}
                          {item.corrected_document_type && (
                            <div className="text-xs text-muted-foreground">
                              Type: {item.corrected_document_type}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm">{item.corrected_by}</span>
                    </TableCell>

                    <TableCell>
                      {item.has_generated_rule ? (
                        <Badge className="bg-purple-100 text-purple-800">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Règle générée
                        </Badge>
                      ) : (
                        <Badge variant="outline">En attente</Badge>
                      )}
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
            Page {page} sur {totalPages}
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
    </div>
  )
}
