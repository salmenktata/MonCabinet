'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { CheckCircle, XCircle, Globe, Percent } from 'lucide-react'

interface ConnectionEntry {
  user_email: string
  nom: string
  prenom: string
  action: string
  ip_address: string
  user_agent: string
  created_at: string
}

interface DayEntry {
  date: string
  success: number
  failures: number
}

interface Summary {
  total: number
  failures: number
  unique_ips: number
  failure_rate: number
}

interface ConnectionsData {
  timeline: ConnectionEntry[]
  daily_chart: DayEntry[]
  summary: Summary
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function parseUA(ua: string | null) {
  if (!ua) return '—'
  if (/mobile/i.test(ua)) return 'Mobile'
  if (/tablet/i.test(ua)) return 'Tablette'
  if (/chrome/i.test(ua)) return 'Chrome'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return 'Autre'
}

export function ConnectionsTab() {
  const [data, setData] = useState<ConnectionsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/connections')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    )
  }

  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { summary, daily_chart, timeline } = data

  const chartData = daily_chart.map(d => ({
    date: d.date.slice(5), // MM-DD
    Succès: d.success,
    Échecs: d.failures,
  }))

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total connexions (30j)', value: summary.total, icon: CheckCircle },
          { label: 'Échecs', value: summary.failures, icon: XCircle },
          { label: 'IPs uniques', value: summary.unique_ips, icon: Globe },
          { label: 'Taux d\'échec', value: `${summary.failure_rate}%`, icon: Percent },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Graphique 30j */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connexions par jour — 30 derniers jours</CardTitle>
            <CardDescription>Succès vs échecs d&apos;authentification</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Succès" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Échecs" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">100 dernières tentatives de connexion</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {timeline.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center">Aucun log de connexion disponible.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Statut</th>
                    <th className="text-left px-4 py-3 font-medium">Utilisateur</th>
                    <th className="text-left px-4 py-3 font-medium">IP</th>
                    <th className="text-left px-4 py-3 font-medium">Navigateur</th>
                    <th className="text-left px-4 py-3 font-medium">Heure</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((entry, i) => (
                    <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">
                        {entry.action === 'login' ? (
                          <Badge variant="default" className="text-xs">Succès</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Échec</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-xs font-medium">{entry.nom} {entry.prenom}</div>
                        <div className="text-muted-foreground text-xs">{entry.user_email}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                        {entry.ip_address || '—'}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {parseUA(entry.user_agent)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {formatDate(entry.created_at)}
                      </td>
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
