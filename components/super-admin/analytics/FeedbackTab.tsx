'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'
import { AlertTriangle } from 'lucide-react'

interface RatingEntry { rating: string; count: number }
interface ProblemType { type: string; count: number }
interface TrendEntry { date: string; positive: number; negative: number }
interface NegativeUser { id: string; email: string; nom: string; prenom: string; neg_count: number }
interface Resolution { resolved: number; unresolved: number; total: number }
interface Summary { satisfaction_rate_30d: number; total_positive: number; total_negative: number }

interface FeedbackData {
  ratings: RatingEntry[]
  problem_types: ProblemType[]
  trend: TrendEntry[]
  negative_users: NegativeUser[]
  resolution: Resolution
  summary: Summary
}

const PROBLEM_LABELS: Record<string, string> = {
  missing_info: 'Info manquante',
  incorrect_citation: 'Citation incorrecte',
  incomplete: 'Réponse incomplète',
  hallucination: 'Hallucination',
  outdated: 'Info obsolète',
  unclear: 'Peu clair',
  other: 'Autre',
}

export function FeedbackTab() {
  const [data, setData] = useState<FeedbackData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/feedback')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>
  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { ratings, problem_types, trend, negative_users, resolution, summary } = data

  const trendChartData = trend.map(t => ({
    date: t.date.slice(5),
    Positifs: t.positive,
    Négatifs: t.negative,
  }))

  const ratingsChartData = [1, 2, 3, 4, 5].map(r => {
    const found = ratings.find(x => parseInt(x.rating) === r)
    return { rating: `★${r}`, count: found?.count || 0 }
  })

  const ratingColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']

  return (
    <div className="space-y-6">
      {/* Résumé */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Satisfaction 30j', value: `${summary.satisfaction_rate_30d}%` },
          { label: 'Feedbacks positifs (30j)', value: summary.total_positive },
          { label: 'Feedbacks négatifs (30j)', value: summary.total_negative },
          { label: 'RAG feedback résolus', value: resolution.total > 0 ? `${resolution.resolved}/${resolution.total}` : '—' },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Distribution ratings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution ratings (30j)</CardTitle>
            <CardDescription>Notes avocats sur les réponses RAG (1–5)</CardDescription>
          </CardHeader>
          <CardContent>
            {ratingsChartData.every(r => r.count === 0) ? (
              <p className="text-muted-foreground text-sm text-center py-8">Aucun rating disponible.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ratingsChartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {ratingsChartData.map((_, i) => (
                      <rect key={i} fill={ratingColors[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Types de problèmes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Types de problèmes signalés (30j)</CardTitle>
          </CardHeader>
          <CardContent>
            {problem_types.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">Aucun problème signalé.</p>
            ) : (
              <div className="space-y-3">
                {problem_types.map(pt => (
                  <div key={pt.type} className="flex items-center justify-between">
                    <span className="text-sm">{PROBLEM_LABELS[pt.type] || pt.type}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-destructive rounded-full"
                          style={{ width: `${Math.min(100, (pt.count / (problem_types[0]?.count || 1)) * 100)}%` }}
                        />
                      </div>
                      <Badge variant="secondary" className="text-xs w-8 text-center">{pt.count}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tendance 30j */}
      {trendChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendance satisfaction — 30j</CardTitle>
            <CardDescription>Évolution quotidienne positif vs négatif</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendChartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="Positifs" stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Négatifs" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Résolution RAG feedback */}
      {resolution.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Résolution des feedbacks RAG</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Résolus</span>
                <span className="font-medium">{resolution.resolved} / {resolution.total}</span>
              </div>
              <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${resolution.total > 0 ? (resolution.resolved / resolution.total) * 100 : 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{resolution.unresolved} non résolus</span>
                <span>{resolution.total > 0 ? Math.round((resolution.resolved / resolution.total) * 100) : 0}% de résolution</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users avec feedbacks négatifs répétés */}
      {negative_users.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Utilisateurs avec feedbacks négatifs répétés (7j)
            </CardTitle>
            <CardDescription>Plus de 3 feedbacks négatifs en 7 jours</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Utilisateur</th>
                  <th className="text-right px-4 py-2 font-medium">Feedbacks négatifs (7j)</th>
                </tr>
              </thead>
              <tbody>
                {negative_users.map(u => (
                  <tr key={u.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="text-xs font-medium">{u.nom} {u.prenom}</div>
                      <div className="text-muted-foreground text-xs">{u.email}</div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant="destructive">{u.neg_count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
