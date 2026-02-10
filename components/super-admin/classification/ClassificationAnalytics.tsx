'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, AlertCircle, TrendingUp } from 'lucide-react'

export function ClassificationAnalytics() {
  const [groupBy, setGroupBy] = useState<'domain' | 'source' | 'reason'>('domain')

  const { data, isLoading, error } = useQuery({
    queryKey: ['classification-analytics', groupBy],
    queryFn: async () => {
      const response = await fetch(
        `/api/super-admin/classification/analytics/top-errors?groupBy=${groupBy}&limit=20`
      )
      if (!response.ok) throw new Error('Failed to fetch analytics')
      return response.json()
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-6 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <span>Erreur: {error instanceof Error ? error.message : 'Erreur inconnue'}</span>
      </div>
    )
  }

  if (!data) return null

  const topDomains = Object.entries(data.byDomain as Record<string, number>)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)

  const topSources = Object.entries(data.bySource as Record<string, number>)
    .sort(([, a], [, b]) => (b as number) - (a as number))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total à revoir
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalPagesRequiringReview}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Domaine principal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topDomains.length > 0 ? (
              <>
                <div className="text-2xl font-bold">{topDomains[0][1]}</div>
                <div className="text-xs text-muted-foreground mt-1">{topDomains[0][0]}</div>
              </>
            ) : (
              <div className="text-2xl font-bold">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Source principale
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length > 0 ? (
              <>
                <div className="text-2xl font-bold">{topSources[0][1]}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {topSources[0][0]}
                </div>
              </>
            ) : (
              <div className="text-2xl font-bold">-</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Priorité urgente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {data.byPriority?.urgent || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution by Priority */}
      <Card>
        <CardHeader>
          <CardTitle>Distribution par priorité</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(data.byPriority as Record<string, number>).map(
              ([priority, count]: [string, number]) => (
                <div key={priority} className="flex items-center gap-3">
                  <Badge
                    className={
                      priority === 'urgent'
                        ? 'bg-red-100 text-red-800'
                        : priority === 'high'
                        ? 'bg-orange-100 text-orange-800'
                        : priority === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }
                  >
                    {priority}
                  </Badge>
                  <div className="flex-1">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={
                          priority === 'urgent'
                            ? 'h-full bg-red-600'
                            : priority === 'high'
                            ? 'h-full bg-orange-600'
                            : priority === 'medium'
                            ? 'h-full bg-yellow-600'
                            : 'h-full bg-green-600'
                        }
                        style={{
                          width: `${(count / data.totalPagesRequiringReview) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-sm font-medium w-16 text-right">{count}</div>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top Errors */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Top erreurs</CardTitle>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">Par domaine</SelectItem>
                <SelectItem value="source">Par source</SelectItem>
                <SelectItem value="reason">Par raison</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.errors.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">Aucune erreur</div>
            )}

            {data.errors.map((error: any, index: number) => (
              <Card key={error.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <CardTitle className="text-base">{error.key}</CardTitle>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-4 w-4" />
                          {error.count} occurrences
                        </div>
                        <div>Confiance: {Math.round(error.avgConfidence * 100)}%</div>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {error.examples?.length > 0 && (
                  <CardContent className="pt-0">
                    <div className="text-xs text-muted-foreground mb-2">Exemples:</div>
                    <div className="space-y-1">
                      {error.examples.map((example: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm rounded-lg bg-muted p-2">
                          {example.priority && (
                            <Badge variant="outline">{example.priority}</Badge>
                          )}
                          <a
                            href={example.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 text-blue-600 hover:underline truncate"
                          >
                            {example.title || example.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Domain/Source Distribution */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Top 5 Domaines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topDomains.map(([domain, count]: [string, number]) => (
                <div key={domain} className="flex items-center gap-3">
                  <div className="flex-1 text-sm font-medium">{domain}</div>
                  <div className="w-32">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600"
                        style={{
                          width: `${(count / data.totalPagesRequiringReview) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-sm font-medium w-12 text-right">{count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top 5 Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topSources.map(([source, count]: [string, number]) => (
                <div key={source} className="flex items-center gap-3">
                  <div className="flex-1 text-sm font-medium truncate">{source}</div>
                  <div className="w-32">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600"
                        style={{
                          width: `${(count / data.totalPagesRequiringReview) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-sm font-medium w-12 text-right">{count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
