'use client'

import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'

interface PipelineDaySummary {
  date: string
  pipeline: 'chat' | 'kb_search'
  totalRequests: number
  abstentionRate: number
  cacheHitRate: number
  avgSourcesCount: number
  avgSimilarity: number
  avgLatencyMs: number
  qualityGateRate: number
  routerFailedRate: number
}

interface PipelineAvg {
  abstentionRate: number
  cacheHitRate: number
  avgSourcesCount: number
  avgSimilarity: number
  avgLatencyMs: number
  qualityGateRate: number
  routerFailedRate: number
  totalRequests: number
}

interface ComparisonData {
  success: boolean
  period: { days: number }
  chat: { daily: PipelineDaySummary[]; avg: PipelineAvg }
  kbSearch: { daily: PipelineDaySummary[]; avg: PipelineAvg }
  comparison: {
    abstentionRateDelta: number | null
    avgSimilarityDelta: number | null
    avgSourcesDelta: number | null
    avgLatencyDelta: number | null
    alerts: string[]
  }
  generatedAt: string
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <Badge variant="outline">N/A</Badge>
  const pct = (delta * 100).toFixed(1)
  const abs = Math.abs(delta)
  if (abs < 0.05) return <Badge variant="secondary"><Minus className="w-3 h-3 mr-1" />{pct}%</Badge>
  if (delta > 0) return (
    <Badge variant={abs > 0.2 ? 'destructive' : 'outline'} className="text-red-600">
      <TrendingUp className="w-3 h-3 mr-1" />+{pct}%
    </Badge>
  )
  return (
    <Badge variant={abs > 0.2 ? 'destructive' : 'outline'} className="text-green-600">
      <TrendingDown className="w-3 h-3 mr-1" />{pct}%
    </Badge>
  )
}

function MetricRow({ label, chat, kbSearch, format, deltaInverted = false }: {
  label: string
  chat: number
  kbSearch: number
  format: (v: number) => string
  deltaInverted?: boolean
}) {
  const delta = chat === 0 ? null : (kbSearch - chat) / chat
  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-4 text-sm text-muted-foreground">{label}</td>
      <td className="py-2 pr-4 text-sm font-mono font-medium">{format(chat)}</td>
      <td className="py-2 pr-4 text-sm font-mono font-medium">{format(kbSearch)}</td>
      <td className="py-2">
        <DeltaBadge delta={deltaInverted ? (delta !== null ? -delta : null) : delta} />
      </td>
    </tr>
  )
}

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }
function ms(v: number) { return `${Math.round(v)}ms` }
function num(v: number) { return v.toFixed(1) }

export function PipelineComparisonTab() {
  const { data, isLoading, error } = useQuery<ComparisonData>({
    queryKey: ['pipeline-comparison'],
    queryFn: async () => {
      const res = await fetch('/api/admin/monitoring/pipeline-comparison?days=7')
      if (!res.ok) throw new Error('Erreur chargement métriques pipelines')
      return res.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )

  if (error || !data?.success) return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>Impossible de charger les métriques de comparaison pipelines.</AlertDescription>
    </Alert>
  )

  const { chat, kbSearch, comparison } = data

  return (
    <div className="space-y-6">
      {/* Alertes divergences */}
      {comparison.alerts.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside">
              {comparison.alerts.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Volumes */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Chat RAG (7j)
            </CardTitle>
            <CardDescription className="text-xs">via /api/chat</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{chat.avg.totalRequests}</p>
            <p className="text-xs text-muted-foreground">requêtes totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-500" />
              KB Search (7j)
            </CardTitle>
            <CardDescription className="text-xs">via /api/client/kb/search</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{kbSearch.avg.totalRequests}</p>
            <p className="text-xs text-muted-foreground">requêtes totales</p>
          </CardContent>
        </Card>
      </div>

      {/* Tableau comparatif */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Comparaison métriques (moyennes 7 jours)</CardTitle>
          <CardDescription className="text-xs">
            Delta = (KB Search − Chat) / Chat. Négatif = KB Search meilleur (pour abstention, latence).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Métrique</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-blue-600">Chat RAG</th>
                <th className="text-left py-2 pr-4 text-xs font-medium text-purple-600">KB Search</th>
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">Delta</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Taux d'abstention"
                chat={chat.avg.abstentionRate}
                kbSearch={kbSearch.avg.abstentionRate}
                format={pct}
                deltaInverted={true}
              />
              <MetricRow
                label="Cache hit rate"
                chat={chat.avg.cacheHitRate}
                kbSearch={kbSearch.avg.cacheHitRate}
                format={pct}
              />
              <MetricRow
                label="Sources moyennes"
                chat={chat.avg.avgSourcesCount}
                kbSearch={kbSearch.avg.avgSourcesCount}
                format={num}
              />
              <MetricRow
                label="Similarité moyenne"
                chat={chat.avg.avgSimilarity}
                kbSearch={kbSearch.avg.avgSimilarity}
                format={(v) => (v * 100).toFixed(1) + '%'}
              />
              <MetricRow
                label="Latence moyenne"
                chat={chat.avg.avgLatencyMs}
                kbSearch={kbSearch.avg.avgLatencyMs}
                format={ms}
                deltaInverted={true}
              />
              <MetricRow
                label="Quality gate déclenché"
                chat={chat.avg.qualityGateRate}
                kbSearch={kbSearch.avg.qualityGateRate}
                format={pct}
                deltaInverted={true}
              />
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Note données insuffisantes */}
      {(chat.avg.totalRequests === 0 || kbSearch.avg.totalRequests < 10) && (
        <Alert>
          <AlertDescription className="text-xs">
            {chat.avg.totalRequests === 0 && kbSearch.avg.totalRequests === 0
              ? 'Aucune donnée disponible. Les métriques s\'accumulent après la première utilisation des pipelines.'
              : kbSearch.avg.totalRequests < 10
                ? `KB Search a moins de 10 requêtes sur 7 jours (${kbSearch.avg.totalRequests} au total) — les comparaisons et alertes sont désactivées jusqu\'à accumulation de données suffisantes.`
                : 'Chat RAG n\'a pas de données sur la période sélectionnée.'
            }
          </AlertDescription>
        </Alert>
      )}

      <p className="text-xs text-muted-foreground text-right">
        Mis à jour : {new Date(data.generatedAt).toLocaleString('fr-FR')}
      </p>
    </div>
  )
}
