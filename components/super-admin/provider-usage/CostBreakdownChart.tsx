'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from '@/components/charts/LazyCharts'
import { Badge } from '@/components/ui/badge'
import useSWR from 'swr'
import { OPERATION_LABELS, PROVIDER_LABELS } from '@/lib/constants/operation-labels'
import { formatCurrency } from '@/lib/utils/format'
import { Loader2 } from 'lucide-react'

interface MatrixResponse {
  matrix: any
  totals: any
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

const OPERATION_COLORS: Record<string, string> = {
  embedding: '#3b82f6',
  chat: '#10b981',
  generation: '#f59e0b',
  classification: '#8b5cf6',
  extraction: '#ec4899'
}

interface CostBreakdownProps {
  days: number
  userId?: string | null
}

export function CostBreakdownChart({ days, userId }: CostBreakdownProps) {
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

  // Transformer les données pour le BarChart empilé
  const providers = ['gemini', 'deepseek', 'groq', 'anthropic', 'openai', 'ollama']
  const operations = Object.keys(OPERATION_LABELS)

  const chartData = providers
    .map(provider => {
      const providerData: any = {
        provider: PROVIDER_LABELS[provider]?.name || provider
      }

      operations.forEach(operation => {
        const cost = data.matrix[provider]?.[operation]?.cost || 0
        providerData[operation] = cost
      })

      return providerData
    })
    .filter(item => {
      // Exclure les providers sans données
      const total = operations.reduce((sum, op) => sum + (item[op] || 0), 0)
      return total > 0
    })

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Coûts Détaillés par Provider</CardTitle>
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
          Coûts Détaillés par Provider
          {userId && (
            <Badge variant="secondary" className="ml-2">
              Filtré par utilisateur
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Décomposition des coûts par opération (barres empilées)
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip
              formatter={(value: number | undefined) => value ? formatCurrency(value, 'USD') : '0 $'}
            />
            <Legend />
            {operations.map(operation => (
              <Bar
                key={operation}
                dataKey={operation}
                name={OPERATION_LABELS[operation].fr}
                stackId="a"
                fill={OPERATION_COLORS[operation]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
