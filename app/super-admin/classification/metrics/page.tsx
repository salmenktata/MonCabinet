'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, BarChart3, Cpu, DollarSign, Target } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { PROVIDER_LABELS } from '@/lib/constants/operation-labels'

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  })

interface MetricsData {
  usage: {
    totalRequests: number
    totalTokens: number
    totalCost: number
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>
    byOperation: Record<string, { requests: number; tokens: number; cost: number }>
  }
  classifications: {
    total: number
    avgConfidence: number
    llmRate: number
    validationRate: number
    sourceDistribution: Record<string, number>
    confidenceDistribution: Record<string, number>
    topCategories: Array<{ category: string; count: number }>
  }
  period: { start: string; end: string; days: number }
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  llm: { label: 'LLM', color: 'bg-purple-600' },
  rules: { label: 'Règles', color: 'bg-blue-600' },
  structure: { label: 'Structure', color: 'bg-green-600' },
  hybrid: { label: 'Hybride', color: 'bg-orange-600' },
  cache: { label: 'Cache', color: 'bg-muted0' },
  unknown: { label: 'Inconnu', color: 'bg-gray-400' },
}

const CONFIDENCE_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: '< 50%', color: 'bg-red-600' },
  medium: { label: '50-70%', color: 'bg-orange-600' },
  high: { label: '70-85%', color: 'bg-blue-600' },
  excellent: { label: '> 85%', color: 'bg-green-600' },
}

export default function ClassificationMetricsPage() {
  const [days, setDays] = useState(7)

  const { data, isLoading, error } = useSWR<MetricsData>(
    `/api/super-admin/classification/metrics?days=${days}`,
    fetcher,
    { refreshInterval: 300000 }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-destructive">Erreur lors du chargement des métriques.</div>
      </div>
    )
  }

  if (!data?.usage || !data?.classifications) return null

  const { usage, classifications } = data
  const maxSource = Math.max(...Object.values(classifications.sourceDistribution), 1)
  const maxConfidence = Math.max(...Object.values(classifications.confidenceDistribution), 1)
  const maxCategory = classifications.topCategories.length > 0
    ? Math.max(...classifications.topCategories.map((c) => c.count), 1)
    : 1

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Métriques Classification</h1>
          <p className="text-muted-foreground">
            Performance et coûts du système de classification juridique
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={days === 7 ? 'default' : 'outline'} onClick={() => setDays(7)}>
            7 jours
          </Button>
          <Button variant={days === 30 ? 'default' : 'outline'} onClick={() => setDays(30)}>
            30 jours
          </Button>
        </div>
      </div>

      {/* Section 1: KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Total classifications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(classifications.total)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Confiance moyenne
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(classifications.avgConfidence * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              Taux LLM
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(classifications.llmRate * 100).toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {classifications.sourceDistribution['llm'] || 0} appels LLM
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Coût total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(usage.totalCost, 'USD')}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatNumber(usage.totalTokens)} tokens
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 2 & 3: Distribution source + confiance */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Distribution par source */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution par source</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(classifications.sourceDistribution).map(([source, count]) => {
                const config = SOURCE_LABELS[source] || SOURCE_LABELS.unknown
                return (
                  <div key={source} className="flex items-center gap-3">
                    <Badge variant="secondary" className="w-20 justify-center text-xs">
                      {config.label}
                    </Badge>
                    <div className="flex-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${config.color} rounded-full`}
                          style={{ width: `${(count / maxSource) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-medium w-16 text-right">{count}</div>
                  </div>
                )
              })}
              {Object.keys(classifications.sourceDistribution).length === 0 && (
                <div className="text-center py-4 text-muted-foreground">Aucune donnée</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Distribution par confiance */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution par confiance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(['low', 'medium', 'high', 'excellent'] as const).map((bracket) => {
                const count = classifications.confidenceDistribution[bracket] || 0
                const config = CONFIDENCE_LABELS[bracket]
                return (
                  <div key={bracket} className="flex items-center gap-3">
                    <Badge variant="secondary" className="w-20 justify-center text-xs">
                      {config.label}
                    </Badge>
                    <div className="flex-1">
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${config.color} rounded-full`}
                          style={{ width: `${(count / maxConfidence) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-sm font-medium w-16 text-right">{count}</div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section 4: Coûts par provider */}
      <Card>
        <CardHeader>
          <CardTitle>Coûts par provider</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(usage.byProvider).length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">Aucune donnée</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Requêtes</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Coût</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(usage.byProvider)
                    .sort(([, a], [, b]) => b.cost - a.cost)
                    .map(([provider, stats]) => {
                      const label = PROVIDER_LABELS[provider]
                      return (
                        <TableRow key={provider}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-3 w-3 rounded-full ${label?.color || 'bg-gray-400'}`}
                              />
                              {label?.name || provider}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{stats.requests}</TableCell>
                          <TableCell className="text-right">
                            {formatNumber(stats.tokens)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(stats.cost, 'USD')}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  <TableRow className="font-bold bg-muted/50">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{usage.totalRequests}</TableCell>
                    <TableCell className="text-right">{formatNumber(usage.totalTokens)}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(usage.totalCost, 'USD')}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 5: Top catégories */}
      <Card>
        <CardHeader>
          <CardTitle>Top catégories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {classifications.topCategories.map(({ category, count }) => (
              <div key={category} className="flex items-center gap-3">
                <div className="text-sm font-medium w-36 truncate">{category}</div>
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full"
                      style={{ width: `${(count / maxCategory) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-sm font-medium w-16 text-right">{count}</div>
              </div>
            ))}
            {classifications.topCategories.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">Aucune donnée</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
