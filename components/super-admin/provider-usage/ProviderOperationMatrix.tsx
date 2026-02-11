'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import useSWR from 'swr'
import { OPERATION_LABELS, PROVIDER_LABELS } from '@/lib/constants/operation-labels'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { Loader2 } from 'lucide-react'

interface MatrixCell {
  tokens: number
  cost: number
  requests: number
}

interface MatrixData {
  [provider: string]: {
    [operation: string]: MatrixCell
  }
}

interface MatrixResponse {
  matrix: MatrixData
  totals: {
    byProvider: Record<string, number>
    byOperation: Record<string, number>
    total: number
  }
  period: {
    start: string
    end: string
    days: number
  }
}

interface MatrixProps {
  days: number
  userId?: string | null
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function ProviderOperationMatrix({ days, userId }: MatrixProps) {
  const apiUrl = userId
    ? `/api/admin/provider-usage-matrix?days=${days}&userId=${userId}`
    : `/api/admin/provider-usage-matrix?days=${days}`

  const { data, isLoading, error } = useSWR<MatrixResponse>(
    apiUrl,
    fetcher,
    { refreshInterval: 300000 } // 5min
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
          <div className="text-destructive">Erreur de chargement des données</div>
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const providers = ['gemini', 'deepseek', 'groq', 'anthropic', 'openai', 'ollama']
  const operations = Object.keys(OPERATION_LABELS)

  // Fonction pour calculer intensité couleur (heatmap)
  const getCostIntensity = (cost: number, maxCost: number) => {
    if (maxCost === 0) return 'rgba(239, 68, 68, 0)'
    const intensity = Math.min(cost / maxCost, 1)
    return `rgba(239, 68, 68, ${intensity * 0.3})` // red avec opacité variable
  }

  const maxCost = Math.max(
    ...Object.values(data.matrix).flatMap(providerData =>
      Object.values(providerData as any).map((cell: any) => cell.cost || 0)
    ),
    0.01 // Éviter division par zéro
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Matrice Provider × Opération ({days} derniers jours)
          {userId && (
            <Badge variant="secondary" className="ml-2">
              Filtré par utilisateur
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Coût total : {formatCurrency(data.totals.total, 'USD')}
          ({formatCurrency(data.totals.total * 3.2, 'TND')})
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10">Opération</TableHead>
              {providers.map(provider => (
                <TableHead key={provider} className="text-center min-w-[140px]">
                  <Badge className={PROVIDER_LABELS[provider].color}>
                    {PROVIDER_LABELS[provider].name}
                  </Badge>
                </TableHead>
              ))}
              <TableHead className="text-right font-bold">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map(operation => {
              const rowTotal = providers.reduce((sum, provider) => {
                return sum + (data.matrix[provider]?.[operation]?.cost || 0)
              }, 0)

              return (
                <TableRow key={operation}>
                  <TableCell className="sticky left-0 bg-background z-10 font-medium">
                    {OPERATION_LABELS[operation].fr}
                  </TableCell>
                  {providers.map(provider => {
                    const cell = data.matrix[provider]?.[operation]
                    if (!cell) {
                      return (
                        <TableCell key={provider} className="text-center text-muted-foreground">
                          -
                        </TableCell>
                      )
                    }

                    return (
                      <TableCell
                        key={provider}
                        className="text-center p-2"
                        style={{ backgroundColor: getCostIntensity(cell.cost, maxCost) }}
                      >
                        <div className="space-y-1">
                          <div className="font-semibold">{formatCurrency(cell.cost, 'USD')}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatNumber(cell.tokens)} tokens
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {cell.requests} req
                          </div>
                        </div>
                      </TableCell>
                    )
                  })}
                  <TableCell className="text-right font-bold">
                    {formatCurrency(rowTotal, 'USD')}
                  </TableCell>
                </TableRow>
              )
            })}
            {/* Total row */}
            <TableRow className="font-bold bg-muted/50">
              <TableCell>TOTAL</TableCell>
              {providers.map(provider => (
                <TableCell key={provider} className="text-center">
                  {formatCurrency(data.totals.byProvider[provider] || 0, 'USD')}
                </TableCell>
              ))}
              <TableCell className="text-right">
                {formatCurrency(data.totals.total, 'USD')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
