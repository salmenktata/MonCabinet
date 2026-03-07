'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Flame } from 'lucide-react'

const DOW_LABELS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.']

interface HeatmapEntry { dow: number; hour: number; count: number }
interface HourEntry { hour: number; count: number }
interface WeekAvgEntry { hour: number; avg_count: number }
interface Peak { dow: number; hour: number; count: number; label: string }

interface PeakData {
  heatmap: HeatmapEntry[]
  today_by_hour: HourEntry[]
  week_avg_by_hour: WeekAvgEntry[]
  peak: Peak | null
}

function getHeatColor(value: number, max: number) {
  if (max === 0) return 'bg-muted'
  const ratio = value / max
  if (ratio === 0) return 'bg-muted/30'
  if (ratio < 0.2) return 'bg-indigo-100 dark:bg-indigo-950'
  if (ratio < 0.4) return 'bg-indigo-200 dark:bg-indigo-900'
  if (ratio < 0.6) return 'bg-indigo-400 dark:bg-indigo-700'
  if (ratio < 0.8) return 'bg-indigo-600 dark:bg-indigo-500'
  return 'bg-indigo-800 dark:bg-indigo-300'
}

export function PeakHoursTab() {
  const [data, setData] = useState<PeakData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/analytics/peak-hours')
      .then(r => r.json())
      .then(d => { if (d.success) setData(d) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-lg" />)}</div>
  if (!data) return <p className="text-muted-foreground">Impossible de charger les données.</p>

  const { heatmap, today_by_hour, week_avg_by_hour, peak } = data

  // Construire grille 7×24
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const entry of heatmap) {
    if (entry.dow >= 0 && entry.dow < 7 && entry.hour >= 0 && entry.hour < 24) {
      grid[entry.dow][entry.hour] = entry.count
    }
  }
  const maxCount = Math.max(...heatmap.map(e => e.count), 1)

  // Graphique aujourd'hui vs moyenne semaine
  const lineData = Array.from({ length: 24 }, (_, h) => {
    const today = today_by_hour.find(e => e.hour === h)?.count || 0
    const avg = week_avg_by_hour.find(e => e.hour === h)?.avg_count || 0
    return { heure: `${h}h`, "Aujourd'hui": today, 'Moy. semaine': parseFloat(avg.toFixed(1)) }
  })

  return (
    <div className="space-y-6">
      {/* Créneau peak */}
      {peak && (
        <Card className="border-orange-500/50 bg-orange-50/20 dark:bg-orange-950/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              Créneau peak — 30 derniers jours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="text-3xl font-bold">{peak.label}</div>
              <Badge variant="secondary" className="text-sm">{peak.count} requêtes</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Heatmap utilisation RAG — 30 jours (heure × jour)</CardTitle>
          <CardDescription>Intensité = nombre de requêtes. Heure locale Europe/Berlin.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Labels heures */}
              <div className="flex mb-1">
                <div className="w-10" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-xs text-muted-foreground">{h}</div>
                ))}
              </div>
              {/* Grille */}
              {DOW_LABELS.map((day, dow) => (
                <div key={dow} className="flex items-center mb-1">
                  <div className="w-10 text-xs text-muted-foreground text-right pr-2 shrink-0">{day}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = grid[dow][h]
                    return (
                      <div
                        key={h}
                        className={`flex-1 h-6 rounded-sm mx-px transition-colors ${getHeatColor(count, maxCount)}`}
                        title={`${day} ${h}h : ${count} requêtes`}
                      />
                    )
                  })}
                </div>
              ))}
              {/* Légende */}
              <div className="flex items-center gap-2 mt-3 justify-end">
                <span className="text-xs text-muted-foreground">Peu</span>
                {['bg-muted/30', 'bg-indigo-100', 'bg-indigo-200', 'bg-indigo-400', 'bg-indigo-600', 'bg-indigo-800'].map((cls, i) => (
                  <div key={i} className={`w-5 h-3 rounded-sm ${cls}`} />
                ))}
                <span className="text-xs text-muted-foreground">Beaucoup</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Courbe aujourd'hui vs moyenne semaine */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requêtes par heure</CardTitle>
          <CardDescription>Aujourd&apos;hui vs moyenne des 30 derniers jours</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="heure" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="Aujourd'hui" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Moy. semaine" stroke="#94a3b8" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
