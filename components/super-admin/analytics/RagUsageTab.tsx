'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

interface Domain { domain: string; count: number; abstentions: number }
interface Language { language: string; count: number }
interface Abstention { question: string; abstention_reason: string; avg_similarity: number; domain: string; created_at: string }
interface AbstentionByDomain { domain: string; total: number; abstentions: number; abstention_rate: number }
interface Quality {
  avg_similarity: number; p50_latency: number | null; p95_latency: number | null
  high_count: number; medium_count: number; low_count: number; total: number
}

interface RagData {
  domains: Domain[]
  languages: Language[]
  abstentions: Abstention[]
  abstention_by_domain: AbstentionByDomain[]
  quality: Quality
}

const LANGUAGE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#94a3b8']
const LANGUAGE_LABELS: Record<string, string> = { ar: 'Arabe', fr: 'Français', mixed: 'Mixte', inconnu: 'Inconnu' }
const ABSTENTION_LABELS: Record<string, string> = {
  quality_gate: 'Qualité insuffisante',
  no_results: 'Aucun résultat',
  error: 'Erreur système',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function RagUsageTab() {
  const [data, setData] = useState<RagData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/rag-usage')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>
  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { domains, languages, abstentions, abstention_by_domain, quality } = data

  const langData = languages.map(l => ({
    name: LANGUAGE_LABELS[l.language] || l.language,
    value: l.count,
  }))

  return (
    <div className="space-y-6">
      {/* Métriques qualité */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Similarité moy.', value: `${(quality.avg_similarity * 100).toFixed(0)}%` },
          { label: 'Latence P50', value: quality.p50_latency ? `${quality.p50_latency}ms` : '—' },
          { label: 'Latence P95', value: quality.p95_latency ? `${quality.p95_latency}ms` : '—' },
          { label: 'Qualité haute', value: quality.high_count },
          { label: 'Qualité moyenne', value: quality.medium_count },
          { label: 'Qualité basse', value: quality.low_count },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent><div className="text-xl font-bold">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top domaines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requêtes par domaine juridique (30j)</CardTitle>
            <CardDescription>Top 10 domaines les plus interrogés</CardDescription>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center">Aucune donnée.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={domains.map(d => ({ name: d.domain, requêtes: d.count, abstentions: d.abstentions }))}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip />
                  <Bar dataKey="requêtes" fill="#6366f1" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="abstentions" fill="#ef4444" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Répartition langues */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Répartition des langues (30j)</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center">
            {langData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Aucune donnée.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={langData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                    {langData.map((_, i) => (
                      <Cell key={i} fill={LANGUAGE_COLORS[i % LANGUAGE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Abstention par domaine */}
      {abstention_by_domain.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taux d&apos;abstention par domaine</CardTitle>
            <CardDescription>Domaines où le RAG échoue le plus (min. 5 requêtes)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Domaine</th>
                  <th className="text-right px-4 py-2 font-medium">Requêtes</th>
                  <th className="text-right px-4 py-2 font-medium">Abstentions</th>
                  <th className="text-right px-4 py-2 font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {abstention_by_domain.map(d => (
                  <tr key={d.domain} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{d.domain}</td>
                    <td className="px-4 py-2 text-right">{d.total}</td>
                    <td className="px-4 py-2 text-right">{d.abstentions}</td>
                    <td className="px-4 py-2 text-right">
                      <Badge variant={d.abstention_rate > 30 ? 'destructive' : d.abstention_rate > 15 ? 'secondary' : 'outline'}>
                        {d.abstention_rate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Liste questions non répondues */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questions sans réponse (30j) — {abstentions.length}</CardTitle>
          <CardDescription>Requêtes où le RAG a refusé de répondre</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {abstentions.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center text-sm">Aucune abstention — excellent !</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-2 font-medium">Question</th>
                    <th className="text-left px-4 py-2 font-medium">Motif</th>
                    <th className="text-right px-4 py-2 font-medium">Similarité</th>
                    <th className="text-left px-4 py-2 font-medium">Domaine</th>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {abstentions.map((a, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 max-w-xs">
                        <p className="text-xs truncate" title={a.question}>{a.question}</p>
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant="destructive" className="text-xs">
                          {ABSTENTION_LABELS[a.abstention_reason] || a.abstention_reason}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-right text-xs">{(a.avg_similarity * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{a.domain || '—'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{formatDate(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
