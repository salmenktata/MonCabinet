'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Loader2 } from 'lucide-react'
import { DOC_TYPE_TRANSLATIONS, type DocumentType } from '@/lib/categories/doc-types'

interface DocTypeStatsRaw {
  doc_type: string | null
  total_docs: number
  indexed_docs: number
  avg_quality: number
  total_chunks: number
  indexation_rate: number
}

interface DocTypeStats {
  doc_type: DocumentType
  total_docs: number
  indexed_docs: number
  avg_quality: number
  total_chunks: number
  indexation_rate: number
}

interface DocTypeBreakdown {
  doc_type: string | null
  category: string
  doc_count: number
  indexed_count: number
  avg_quality: number
}

const DOC_TYPE_COLORS: Record<DocumentType, string> = {
  TEXTES: '#3b82f6', // blue
  JURIS: '#8b5cf6', // purple
  PROC: '#06b6d4', // cyan
  TEMPLATES: '#10b981', // emerald
  DOCTRINE: '#f59e0b', // amber
}

const DOC_TYPE_ICONS: Record<DocumentType, string> = {
  TEXTES: '📕',
  JURIS: '⚖️',
  PROC: '📋',
  TEMPLATES: '📄',
  DOCTRINE: '📚',
}

export function DocTypeStatsPanel() {
  const [stats, setStats] = useState<DocTypeStats[]>([])
  const [unclassified, setUnclassified] = useState<DocTypeStatsRaw | null>(null)
  const [breakdown, setBreakdown] = useState<DocTypeBreakdown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      const response = await fetch('/api/admin/monitoring/doc-type-stats')
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      const allStats: DocTypeStatsRaw[] = data.stats || []
      // Séparer les docs classés des non-classés (doc_type null)
      const classified = allStats.filter((s): s is DocTypeStats => s.doc_type != null && s.doc_type !== '' && s.doc_type in DOC_TYPE_TRANSLATIONS)
      const unclassifiedRow = allStats.find((s) => s.doc_type == null || s.doc_type === '' || !(s.doc_type in DOC_TYPE_TRANSLATIONS))
      setStats(classified)
      setUnclassified(unclassifiedRow || null)
      setBreakdown((data.breakdown || []).filter((b: DocTypeBreakdown) => b.doc_type != null && b.doc_type !== '' && b.doc_type in DOC_TYPE_TRANSLATIONS))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-sm text-destructive">❌ {error}</p>
        </CardContent>
      </Card>
    )
  }

  const classifiedDocs = stats.reduce((sum, s) => sum + s.total_docs, 0)
  const totalDocs = classifiedDocs + (unclassified?.total_docs || 0)

  const pieData = stats.map((s) => ({
    name: DOC_TYPE_TRANSLATIONS[s.doc_type].fr,
    value: s.total_docs,
    icon: DOC_TYPE_ICONS[s.doc_type],
  }))

  return (
    <div className="space-y-6">
      {/* Bandeau docs non classés */}
      {unclassified && unclassified.total_docs > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <span className="text-orange-600">&#9888;</span>
              <span className="text-sm font-medium text-orange-800 dark:text-orange-300">
                {unclassified.total_docs.toLocaleString()} documents sans type (doc_type NULL)
              </span>
            </div>
            <span className="text-xs text-orange-600 dark:text-orange-400">
              {unclassified.total_chunks.toLocaleString()} chunks | Qualité moy: {unclassified.avg_quality}/100
            </span>
          </CardContent>
        </Card>
      )}

      {/* KPIs Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => {
          const percentage = totalDocs > 0 ? ((stat.total_docs / totalDocs) * 100).toFixed(1) : '0'

          return (
            <Card key={stat.doc_type}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {DOC_TYPE_ICONS[stat.doc_type]} {DOC_TYPE_TRANSLATIONS[stat.doc_type].fr}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.total_docs.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">
                  {percentage}% du total • {stat.indexation_rate}% indexés
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Qualité:</span>
                  <span className="font-medium">{stat.avg_quality}/100</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{stat.total_chunks.toLocaleString()} chunks</span>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution par type</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry: any) => {
                    const data = entry.payload as typeof pieData[0]
                    return `${data.icon} ${data.name} (${((entry.value / totalDocs) * 100).toFixed(0)}%)`
                  }}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => {
                    const docType = stats[index].doc_type
                    return <Cell key={`cell-${index}`} fill={DOC_TYPE_COLORS[docType]} />
                  })}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Détail par catégorie</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-left">Catégorie</th>
                    <th className="p-2 text-right">Docs</th>
                    <th className="p-2 text-right">Qualité</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((row, i) => (
                    <tr key={i} className="border-b">
                      <td className="p-2">
                        <span className="flex items-center gap-1">
                          {row.doc_type && DOC_TYPE_ICONS[row.doc_type as DocumentType]}
                          <span className="text-xs">{row.doc_type || 'Non classé'}</span>
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground">{row.category}</td>
                      <td className="p-2 text-right font-mono">{row.doc_count}</td>
                      <td className="p-2 text-right">
                        <span
                          className={
                            row.avg_quality >= 80
                              ? 'text-green-600'
                              : row.avg_quality >= 60
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }
                        >
                          {row.avg_quality}/100
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé global</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Total documents</p>
              <p className="text-2xl font-bold">{totalDocs.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total chunks</p>
              <p className="text-2xl font-bold">
                {stats.reduce((sum, s) => sum + s.total_chunks, 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Taux indexation</p>
              <p className="text-2xl font-bold">
                {totalDocs > 0
                  ? (
                      (stats.reduce((sum, s) => sum + s.indexed_docs, 0) / totalDocs) *
                      100
                    ).toFixed(1)
                  : 0}
                %
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Qualité moyenne</p>
              <p className="text-2xl font-bold">
                {stats.length > 0
                  ? (stats.reduce((sum, s) => sum + s.avg_quality, 0) / stats.length).toFixed(1)
                  : 0}
                /100
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
