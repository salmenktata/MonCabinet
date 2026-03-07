'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

const USD_TO_TND = 3.1

const PROVIDER_COLORS: Record<string, string> = {
  groq: '#8b5cf6',
  deepseek: '#3b82f6',
  openai: '#22c55e',
  ollama: '#f59e0b',
  gemini: '#06b6d4',
}

interface DayEntry { date: string; provider: string; total_tokens: number; cost_usd: number }
interface TopUser { id: string; email: string; nom: string; prenom: string; total_cost: number; total_tokens: number; operations: number }
interface ByOperation { operation_type: string; total_tokens: number; cost_usd: number; count: number }
interface Totals {
  input_tokens: number; output_tokens: number; total_tokens: number
  total_cost_usd: number; operations: number; avg_cost_per_op: number
}

interface TokensData {
  daily: DayEntry[]
  top_users: TopUser[]
  by_operation: ByOperation[]
  totals: Totals
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export function TokensTab() {
  const [data, setData] = useState<TokensData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/tokens')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>
  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { daily, top_users, by_operation, totals } = data

  // Construire les données du graphique : une ligne par provider
  const providers = [...new Set(daily.map(d => d.provider))]
  const dateMap = new Map<string, Record<string, number>>()
  for (const row of daily) {
    if (!dateMap.has(row.date)) dateMap.set(row.date, {})
    dateMap.get(row.date)![row.provider] = Math.round(row.total_tokens / 1000)
  }
  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => ({ date: date.slice(5), ...vals }))

  return (
    <div className="space-y-6">
      {/* Totaux */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Tokens totaux (30j)', value: formatTokens(totals.total_tokens) },
          { label: 'Tokens input', value: formatTokens(totals.input_tokens) },
          { label: 'Tokens output', value: formatTokens(totals.output_tokens) },
          { label: 'Coût total (30j)', value: `$${totals.total_cost_usd.toFixed(3)}` },
          { label: '≈ TND', value: `${(totals.total_cost_usd * USD_TO_TND).toFixed(3)}` },
          { label: 'Coût moyen/op.', value: `$${totals.avg_cost_per_op.toFixed(5)}` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Graphique tokens/jour par provider */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens consommés par provider — 30j (milliers)</CardTitle>
            <CardDescription>Évolution quotidienne par fournisseur IA</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="K" />
                <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}K tokens`]} />
                <Legend />
                {providers.map(p => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={PROVIDER_COLORS[p] || '#94a3b8'}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top 10 users */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 utilisateurs — coût ce mois</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {top_users.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">Aucune donnée.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Utilisateur</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens</th>
                    <th className="text-right px-4 py-2 font-medium">Coût USD</th>
                  </tr>
                </thead>
                <tbody>
                  {top_users.map((u, i) => (
                    <tr key={u.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <span className="text-muted-foreground mr-2 text-xs">#{i + 1}</span>
                        <div className="text-xs font-medium">{u.nom} {u.prenom}</div>
                        <div className="text-muted-foreground text-xs">{u.email}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-xs">{formatTokens(u.total_tokens)}</td>
                      <td className="px-4 py-2 text-right text-xs">
                        <Badge variant="outline">${u.total_cost.toFixed(4)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Par opération */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tokens par type d&apos;opération (30j)</CardTitle>
          </CardHeader>
          <CardContent>
            {by_operation.length === 0 ? (
              <p className="text-muted-foreground text-center text-sm">Aucune donnée.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={by_operation.map(o => ({ name: o.operation_type, tokens: Math.round(o.total_tokens / 1000) }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="K" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip formatter={(v: number | undefined) => [`${v ?? 0}K tokens`]} />
                  <Bar dataKey="tokens" fill="#6366f1" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
