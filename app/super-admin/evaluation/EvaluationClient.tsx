'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface RunSummary {
  run_id: string
  started_at: string
  total_questions: number
  avg_recall_5: number
  avg_mrr: number
  avg_faithfulness: number
  avg_citation_accuracy: number
  avg_latency_ms: number
  failed_count: number
}

interface RunDetail {
  id: string
  question_id: string
  question: string
  domain: string
  difficulty: string
  recall_at_5: number
  mrr: number
  faithfulness_score: number
  citation_accuracy: number
  latency_ms: number
  gold_chunk_ids: string[]
  retrieved_chunk_ids: string[]
}

interface RunDetailedResult {
  summary: {
    total: number
    avg_recall_1: number
    avg_recall_3: number
    avg_recall_5: number
    avg_recall_10: number
    avg_precision_5: number
    avg_mrr: number
    avg_faithfulness: number
    avg_citation_accuracy: number
    avg_latency_ms: number
    high_recall_count: number
    failed_count: number
  }
  results: RunDetail[]
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function EvaluationClient() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRunProgress, setActiveRunProgress] = useState({ progress: 0, total: 0 })
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, RunDetailedResult>>({})

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/eval/results')
      if (res.ok) {
        const data = await res.json()
        setRuns(data.runs || [])
      }
    } catch (error) {
      console.error('Erreur chargement runs:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [fetchRuns])

  // Polling pour le run actif
  useEffect(() => {
    if (!activeRunId) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/eval/run?run_id=${activeRunId}`)
        if (res.ok) {
          const data = await res.json()
          setActiveRunProgress({ progress: data.progress, total: data.total })
          if (data.status === 'done' || data.status === 'error') {
            setActiveRunId(null)
            fetchRuns()
          }
        }
      } catch {
        // silently ignore polling errors
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [activeRunId, fetchRuns])

  const launchBenchmark = async (mode: 'quick' | 'full', llmJudge = false) => {
    setLaunching(true)
    try {
      const res = await fetch('/api/admin/eval/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, llmJudge }),
      })
      if (res.ok) {
        const data = await res.json()
        setActiveRunId(data.runId)
        setActiveRunProgress({ progress: 0, total: data.totalQuestions })
      }
    } catch (error) {
      console.error('Erreur lancement:', error)
    } finally {
      setLaunching(false)
    }
  }

  const toggleRunDetails = async (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null)
      return
    }
    setExpandedRun(runId)
    if (!runDetails[runId]) {
      try {
        const res = await fetch(`/api/admin/eval/results?run_id=${runId}`)
        if (res.ok) {
          const data = await res.json()
          setRunDetails(prev => ({ ...prev, [runId]: { summary: data.summary, results: data.results } }))
        }
      } catch (error) {
        console.error('Erreur chargement détails:', error)
      }
    }
  }

  const metricColor = (value: number, thresholds: [number, number] = [0.5, 0.8]) => {
    if (value >= thresholds[1]) return 'text-green-600'
    if (value >= thresholds[0]) return 'text-yellow-600'
    return 'text-red-600'
  }

  const trendIcon = (current: number, previous: number | undefined) => {
    if (!previous) return null
    const diff = current - previous
    if (Math.abs(diff) < 0.01) return null
    return diff > 0
      ? <TrendingUp className="h-3 w-3 text-green-500 inline ml-1" />
      : <TrendingDown className="h-3 w-3 text-red-500 inline ml-1" />
  }

  const latestRun = runs[0]
  const previousRun = runs[1]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Évaluation RAG</h1>
          <p className="text-muted-foreground">Scorecard du pipeline de recherche et génération</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchRuns} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Lancer un benchmark */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lancer un benchmark</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => launchBenchmark('quick')}
              disabled={launching || !!activeRunId}
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Quick (20 questions)
            </Button>
            <Button
              onClick={() => launchBenchmark('full')}
              disabled={launching || !!activeRunId}
              variant="outline"
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Full (toutes)
            </Button>
            <Button
              onClick={() => launchBenchmark('quick', true)}
              disabled={launching || !!activeRunId}
              variant="outline"
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Quick + LLM Judge
            </Button>

            {activeRunId && (
              <div className="flex items-center gap-2 ml-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">
                  {activeRunProgress.progress}/{activeRunProgress.total} questions...
                </span>
                <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${activeRunProgress.total > 0 ? (activeRunProgress.progress / activeRunProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Scorecard du dernier run */}
      {latestRun && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Recall@5</p>
              <p className={`text-2xl font-bold ${metricColor(parseFloat(String(latestRun.avg_recall_5)))}`}>
                {(parseFloat(String(latestRun.avg_recall_5)) * 100).toFixed(1)}%
                {trendIcon(parseFloat(String(latestRun.avg_recall_5)), previousRun ? parseFloat(String(previousRun.avg_recall_5)) : undefined)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">MRR</p>
              <p className={`text-2xl font-bold ${metricColor(parseFloat(String(latestRun.avg_mrr)))}`}>
                {(parseFloat(String(latestRun.avg_mrr)) * 100).toFixed(1)}%
                {trendIcon(parseFloat(String(latestRun.avg_mrr)), previousRun ? parseFloat(String(previousRun.avg_mrr)) : undefined)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Faithfulness</p>
              <p className={`text-2xl font-bold ${metricColor(parseFloat(String(latestRun.avg_faithfulness)), [0.3, 0.6])}`}>
                {(parseFloat(String(latestRun.avg_faithfulness)) * 100).toFixed(1)}%
                {trendIcon(parseFloat(String(latestRun.avg_faithfulness)), previousRun ? parseFloat(String(previousRun.avg_faithfulness)) : undefined)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Citations</p>
              <p className={`text-2xl font-bold ${metricColor(parseFloat(String(latestRun.avg_citation_accuracy)), [0.3, 0.6])}`}>
                {(parseFloat(String(latestRun.avg_citation_accuracy)) * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">Latence moy.</p>
              <p className="text-2xl font-bold">
                {parseFloat(String(latestRun.avg_latency_ms)).toFixed(0)}ms
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Historique des runs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique des runs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Aucun run d'évaluation. Lancez votre premier benchmark ci-dessus.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run, idx) => (
                <div key={run.run_id}>
                  <button
                    onClick={() => toggleRunDetails(run.run_id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {expandedRun === run.run_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="text-sm font-medium">
                        {new Date(run.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-xs">{run.total_questions}q</Badge>
                      {idx === 0 && <Badge className="bg-blue-100 text-blue-700 text-xs">Dernier</Badge>}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>R@5: <span className={metricColor(parseFloat(String(run.avg_recall_5)))}>{(parseFloat(String(run.avg_recall_5)) * 100).toFixed(0)}%</span></span>
                      <span>MRR: <span className={metricColor(parseFloat(String(run.avg_mrr)))}>{(parseFloat(String(run.avg_mrr)) * 100).toFixed(0)}%</span></span>
                      <span>Faith: {(parseFloat(String(run.avg_faithfulness)) * 100).toFixed(0)}%</span>
                      {parseInt(String(run.failed_count)) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />{run.failed_count} échecs
                        </Badge>
                      )}
                    </div>
                  </button>

                  {/* Détail du run */}
                  {expandedRun === run.run_id && runDetails[run.run_id] && (
                    <div className="ml-7 mt-2 mb-4 space-y-2">
                      {/* Métriques agrégées */}
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">R@1</span>
                          <span className="ml-2 font-medium">{(parseFloat(String(runDetails[run.run_id].summary.avg_recall_1)) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">R@3</span>
                          <span className="ml-2 font-medium">{(parseFloat(String(runDetails[run.run_id].summary.avg_recall_3)) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">P@5</span>
                          <span className="ml-2 font-medium">{(parseFloat(String(runDetails[run.run_id].summary.avg_precision_5)) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">R@10</span>
                          <span className="ml-2 font-medium">{(parseFloat(String(runDetails[run.run_id].summary.avg_recall_10)) * 100).toFixed(1)}%</span>
                        </div>
                      </div>

                      {/* Liste des questions */}
                      <div className="max-h-80 overflow-y-auto space-y-1">
                        {runDetails[run.run_id].results.map(r => {
                          const hasGold = r.gold_chunk_ids && r.gold_chunk_ids.length > 0
                          const recall5 = parseFloat(String(r.recall_at_5))
                          return (
                            <div key={r.id} className="flex items-center gap-2 px-2 py-1 text-xs rounded hover:bg-muted/30">
                              {!hasGold ? (
                                <span className="text-gray-400">--</span>
                              ) : recall5 >= 0.8 ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="h-3 w-3 text-red-500 shrink-0" />
                              )}
                              <span className="truncate flex-1" dir="auto">{r.question}</span>
                              <Badge variant="outline" className="text-[10px] shrink-0">{r.domain}</Badge>
                              <span className="text-muted-foreground shrink-0 w-16 text-right">
                                R@5:{(recall5 * 100).toFixed(0)}%
                              </span>
                              <span className="text-muted-foreground shrink-0 w-12 text-right">
                                {r.latency_ms}ms
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
