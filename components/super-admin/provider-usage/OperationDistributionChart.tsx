'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from '@/components/charts/LazyCharts'
import { Badge } from '@/components/ui/badge'
import useSWR from 'swr'
import { OPERATION_LABELS } from '@/lib/constants/operation-labels'
import { formatCurrency } from '@/lib/utils/format'
import { Loader2 } from 'lucide-react'

interface MatrixResponse {
  matrix: any
  totals: {
    byProvider: Record<string, number>
    byOperation: Record<string, number>
    total: number
  }
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

const OPERATION_COLORS: Record<string, string> = {
  embedding: '#3b82f6',
  chat: '#10b981',
  generation: '#f59e0b',
  classification: '#8b5cf6',
  extraction: '#ec4899'
}

interface DistributionChartProps {
  days: number
  userId?: string | null
}

export function OperationDistributionChart({ days, userId }: DistributionChartProps) {
  const apiUrl = userId
    ? `/api/admin/provider-usage-matrix?days=${days}&userId=${userId}`
    : `/api/admin/provider-usage-matrix?days=${days}`

  const { data, isLoading, error } = useSWR<MatrixResponse>(
    apiUrl,
    fetcher,
    { refreshInterval: 300000 }
  )

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-destructive">Erreur de chargement</div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  // Transformer les données pour le PieChart
  const chartData = Object.entries(data.totals.byOperation)
    .map(([operation, cost]) => ({
      name: OPERATION_LABELS[operation]?.fr || operation,
      value: cost,
      percentage: data.totals.total > 0 ? ((cost / data.totals.total) * 100).toFixed(1) : 0
    }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Distribution par Opération</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground text-center p-12">
            Aucune donnée disponible
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Distribution par Opération
          {userId && (
            <Badge variant="secondary" className="ml-2">
              Filtré par utilisateur
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Répartition des coûts par type d'opération
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${percent ? (percent * 100).toFixed(0) : '0'}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => {
                const operationKey = Object.keys(OPERATION_LABELS).find(
                  key => OPERATION_LABELS[key].fr === entry.name
                )
                const color = operationKey ? OPERATION_COLORS[operationKey] : '#6b7280'
                return <Cell key={`cell-${index}`} fill={color} />
              })}
            </Pie>
            <Tooltip
              formatter={(value: number | undefined) => value ? formatCurrency(value, 'USD') : '0 $'}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
