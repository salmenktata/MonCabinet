'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import useSWR from 'swr'
import { PROVIDER_LABELS } from '@/lib/constants/operation-labels'
import { Loader2 } from 'lucide-react'

interface DailyTrend {
  date: string
  [key: string]: string | number
}

interface TrendsResponse {
  trends: DailyTrend[]
  summary: Record<string, any>
  period: {
    start: string
    end: string
    days: number
  }
}

const fetcher = (url: string) => fetch(url).then(res => res.json())

const PROVIDER_COLORS = {
  gemini: '#3b82f6',
  deepseek: '#a855f7',
  groq: '#f97316',
  anthropic: '#ef4444',
  ollama: '#22c55e'
}

export function ProviderTrendsChart({ days }: { days: number }) {
  const { data, isLoading, error } = useSWR<TrendsResponse>(
    `/api/admin/provider-usage-trends?days=${days}`,
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

  if (!data || data.trends.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tendance Tokens par Provider</CardTitle>
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
        <CardTitle>Tendance Tokens par Provider</CardTitle>
        <p className="text-sm text-muted-foreground">
          Évolution quotidienne du nombre de tokens
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.trends}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
            />
            <YAxis />
            <Tooltip
              labelFormatter={(value) => new Date(value).toLocaleDateString('fr-FR', { dateStyle: 'medium' })}
              formatter={(value: number | undefined) => [value ? value.toLocaleString('fr-FR') : '0', 'tokens']}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="gemini_tokens"
              name="Gemini"
              stroke={PROVIDER_COLORS.gemini}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="deepseek_tokens"
              name="DeepSeek"
              stroke={PROVIDER_COLORS.deepseek}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="groq_tokens"
              name="Groq"
              stroke={PROVIDER_COLORS.groq}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="anthropic_tokens"
              name="Anthropic"
              stroke={PROVIDER_COLORS.anthropic}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="ollama_tokens"
              name="Ollama"
              stroke={PROVIDER_COLORS.ollama}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
