'use client'

/**
 * Composant: ClassificationAnalytics
 *
 * Analytics et statistiques de classification
 */

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'

// =============================================================================
// TYPES
// =============================================================================

interface TopError {
  key: string
  count: number
  percentage: number
  avgConfidence: number
  examples: Array<{
    url: string
    title: string | null
    priority: string | null
  }>
}

interface TopErrorsResponse {
  errors: TopError[]
  totalPagesRequiringReview: number
  byDomain: Record<string, number>
  bySource: Record<string, number>
  byPriority: Record<string, number>
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ClassificationAnalytics() {
  const [groupBy, setGroupBy] = useState<'domain' | 'source' | 'reason'>('domain')

  const { data, isLoading, error } = useQuery<TopErrorsResponse>({
    queryKey: ['classification-analytics-top-errors', groupBy],
    queryFn: async () => {
      const response = await fetch(
        `/api/super-admin/classification/analytics/top-errors?groupBy=${groupBy}&limit=20`
      )
      if (!response.ok) {
        throw new Error('Erreur lors du chargement des analytics')
      }
      return response.json()
    },
  })

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Pages à Revoir</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{data.totalPagesRequiringReview}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Par Priorité</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>🔴 Urgent:</span>
                <span className="font-medium">{data.byPriority.urgent || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>🟠 High:</span>
                <span className="font-medium">{data.byPriority.high || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>🟡 Medium:</span>
                <span className="font-medium">{data.byPriority.medium || 0}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Top Domaine</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.entries(data.byDomain)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 1)
                .map(([domain, count]) => (
                  <div key={domain}>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground">{domain}</div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Top Source</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.entries(data.bySource)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 1)
                .map(([source, count]) => (
                  <div key={source}>
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-sm text-muted-foreground truncate">{source}</div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Errors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Top Erreurs de Classification</CardTitle>
              <CardDescription>
                Pages nécessitant validation groupées par {groupBy === 'domain' ? 'domaine' : groupBy === 'source' ? 'source' : 'raison'}
              </CardDescription>
            </div>
            <div className="w-[180px]">
              <Label htmlFor="groupby">Grouper par</Label>
              <Select value={groupBy} onValueChange={(val) => setGroupBy(val as typeof groupBy)}>
                <SelectTrigger id="groupby">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="domain">Domaine</SelectItem>
                  <SelectItem value="source">Source</SelectItem>
                  <SelectItem value="reason">Raison</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12 text-red-600">
              Erreur lors du chargement des analytics
            </div>
          ) : !data || data.errors.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Aucune erreur à afficher 🎉
            </div>
          ) : (
            <div className="space-y-4">
              {data.errors.map((error, index) => (
                <div
                  key={error.key}
                  className="flex items-start justify-between border-b pb-4 last:border-0"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        #{index + 1}
                      </Badge>
                      <span className="font-medium">{error.key || '(Non défini)'}</span>
                    </div>

                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{error.count} pages</span>
                      <span>•</span>
                      <span>{error.percentage.toFixed(1)}% du total</span>
                      <span>•</span>
                      <span>
                        Confiance moyenne:{' '}
                        <Badge
                          variant="outline"
                          className={
                            error.avgConfidence >= 0.7
                              ? 'bg-green-100 text-green-800'
                              : error.avgConfidence >= 0.5
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }
                        >
                          {(error.avgConfidence * 100).toFixed(0)}%
                        </Badge>
                      </span>
                    </div>

                    {error.examples.length > 0 && (
                      <div className="text-xs text-muted-foreground space-y-1 ml-8">
                        <div className="font-medium">Exemples:</div>
                        {error.examples.map((example, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span>•</span>
                            <a
                              href={example.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate max-w-[400px]"
                            >
                              {example.title || example.url}
                            </a>
                            {example.priority && (
                              <Badge variant="outline" className="text-xs">
                                {example.priority}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold">{error.count}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
