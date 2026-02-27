'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
  GitCompareArrows,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'
import type {
  RunSummary,
  RunDetailedResult,
  RunMode,
  DomainBreakdown,
  DifficultyBreakdown,
  CompareResult,
  QuestionDiff,
} from '@/lib/ai/rag-eval-types'
import { KnowledgeGapsTab } from './components/KnowledgeGapsTab'
import { ReviewQueueTab } from './components/ReviewQueueTab'
import { SilverDatasetTab } from './components/SilverDatasetTab'

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

type TabId = 'scorecard' | 'history' | 'breakdown' | 'compare' | 'quality'

export function EvaluationClient() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [launching, setLaunching] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [activeRunProgress, setActiveRunProgress] = useState({ progress: 0, total: 0 })
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runDetails, setRunDetails] = useState<Record<string, RunDetailedResult>>({})
  const [activeTab, setActiveTab] = useState<TabId>('scorecard')

  // Launch config
  const [runMode, setRunMode] = useState<RunMode>('retrieval')
  const [runLabel, setRunLabel] = useState('')

  // Breakdown
  const [breakdownData, setBreakdownData] = useState<{ domain: DomainBreakdown[]; difficulty: DifficultyBreakdown[] } | null>(null)
  const [breakdownRunId, setBreakdownRunId] = useState<string | null>(null)

  // Compare
  const [compareRunA, setCompareRunA] = useState<string | null>(null)
  const [compareRunB, setCompareRunB] = useState<string | null>(null)
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)

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

  const launchBenchmark = async (mode: 'quick' | 'full') => {
    setLaunching(true)
    try {
      const res = await fetch('/api/admin/eval/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          runMode,
          label: runLabel || undefined,
        }),
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

  const fetchBreakdown = async (runId: string) => {
    setBreakdownRunId(runId)
    try {
      const res = await fetch(`/api/admin/eval/results?run_id=${runId}&breakdown=true`)
      if (res.ok) {
        const data = await res.json()
        setBreakdownData({
          domain: data.domainBreakdown || [],
          difficulty: data.difficultyBreakdown || [],
        })
      }
    } catch (error) {
      console.error('Erreur breakdown:', error)
    }
  }

  const fetchCompare = async () => {
    if (!compareRunA || !compareRunB) return
    setCompareLoading(true)
    try {
      const res = await fetch(`/api/admin/eval/compare?run_a=${compareRunA}&run_b=${compareRunB}`)
      if (res.ok) {
        const data = await res.json()
        setCompareResult(data)
      }
    } catch (error) {
      console.error('Erreur comparaison:', error)
    } finally {
      setCompareLoading(false)
    }
  }

  const metricColor = (value: number, thresholds: [number, number] = [0.5, 0.8]) => {
    if (value >= thresholds[1]) return 'text-green-600'
    if (value >= thresholds[0]) return 'text-yellow-600'
    return 'text-red-600'
  }

  const deltaColor = (delta: number) => {
    if (delta > 0.01) return 'text-green-600'
    if (delta < -0.01) return 'text-red-600'
    return 'text-muted-foreground'
  }

  const trendIcon = (current: number, previous: number | undefined) => {
    if (!previous) return null
    const diff = current - previous
    if (Math.abs(diff) < 0.01) return null
    return diff > 0
      ? <TrendingUp className="h-3 w-3 text-green-500 inline ml-1" />
      : <TrendingDown className="h-3 w-3 text-red-500 inline ml-1" />
  }

  const pct = (v: any) => (parseFloat(String(v)) * 100).toFixed(1) + '%'
  const pct0 = (v: any) => (parseFloat(String(v)) * 100).toFixed(0) + '%'

  const latestRun = runs[0]
  const previousRun = runs[1]

  const runDisplayName = (run: RunSummary) => {
    const label = run.run_label ? `[${run.run_label}]` : ''
    const mode = run.run_mode && run.run_mode !== 'retrieval' ? ` (${run.run_mode})` : ''
    const date = new Date(run.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    return `${date} ${label}${mode}`.trim()
  }

  // =============================================================================
  // RENDER
  // =============================================================================

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

      {/* Lanceur de benchmark */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lancer un benchmark</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={runMode}
              onChange={e => setRunMode(e.target.value as RunMode)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="retrieval">Retrieval seul</option>
              <option value="e2e">E2E (+ LLM)</option>
              <option value="e2e+judge">E2E + Judge</option>
            </select>
            <Input
              placeholder="Label (ex: baseline, v2-hybrid)"
              value={runLabel}
              onChange={e => setRunLabel(e.target.value)}
              className="w-48 h-9"
            />
            <Button
              onClick={() => launchBenchmark('quick')}
              disabled={launching || !!activeRunId}
              size="sm"
            >
              <Play className="h-4 w-4 mr-2" />
              Quick (20q)
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

      {/* Onglets */}
      <div className="flex gap-1 border-b">
        {([
          { id: 'scorecard', label: 'Scorecard' },
          { id: 'history', label: 'Historique' },
          { id: 'breakdown', label: 'Breakdown' },
          { id: 'compare', label: 'Comparaison A/B' },
          { id: 'quality', label: 'Qualité IA' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ==================== ONGLET SCORECARD ==================== */}
      {activeTab === 'scorecard' && latestRun && (
        <div className="space-y-4">
          {/* Retrieval metrics */}
          <div>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">Retrieval</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <ScoreCard label="Recall@5" value={pct(latestRun.avg_recall_5)} color={metricColor(parseFloat(String(latestRun.avg_recall_5)))} trend={trendIcon(parseFloat(String(latestRun.avg_recall_5)), previousRun ? parseFloat(String(previousRun.avg_recall_5)) : undefined)} />
              <ScoreCard label="MRR" value={pct(latestRun.avg_mrr)} color={metricColor(parseFloat(String(latestRun.avg_mrr)))} trend={trendIcon(parseFloat(String(latestRun.avg_mrr)), previousRun ? parseFloat(String(previousRun.avg_mrr)) : undefined)} />
              <ScoreCard label="Faithfulness" value={pct(latestRun.avg_faithfulness)} color={metricColor(parseFloat(String(latestRun.avg_faithfulness)), [0.3, 0.6])} trend={trendIcon(parseFloat(String(latestRun.avg_faithfulness)), previousRun ? parseFloat(String(previousRun.avg_faithfulness)) : undefined)} />
              <ScoreCard label="Citations" value={pct(latestRun.avg_citation_accuracy)} color={metricColor(parseFloat(String(latestRun.avg_citation_accuracy)), [0.3, 0.6])} />
              <ScoreCard label="Latence moy." value={`${parseFloat(String(latestRun.avg_latency_ms)).toFixed(0)}ms`} color="" />
            </div>
          </div>

          {/* Judge metrics (if available) */}
          {latestRun.avg_judge_score !== null && latestRun.avg_judge_score !== undefined && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">LLM Judge</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ScoreCard label="Judge Score" value={pct(latestRun.avg_judge_score)} color={metricColor(parseFloat(String(latestRun.avg_judge_score)), [0.4, 0.7])} />
              </div>
            </div>
          )}

          {/* Run info */}
          <div className="text-xs text-muted-foreground">
            Dernier run: {new Date(latestRun.started_at).toLocaleString('fr-FR')}
            {latestRun.run_label && <> &middot; Label: <Badge variant="outline" className="text-xs ml-1">{latestRun.run_label}</Badge></>}
            {latestRun.run_mode && <> &middot; Mode: <Badge variant="secondary" className="text-xs ml-1">{latestRun.run_mode}</Badge></>}
            &middot; {latestRun.total_questions} questions
          </div>
        </div>
      )}

      {activeTab === 'scorecard' && !latestRun && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Aucun run. Lancez votre premier benchmark ci-dessus.
        </p>
      )}

      {/* ==================== ONGLET HISTORIQUE ==================== */}
      {activeTab === 'history' && (
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
                Aucun run d'évaluation.
              </p>
            ) : (
              <div className="space-y-2">
                {runs.map((run, idx) => (
                  <div key={run.run_id}>
                    <button
                      onClick={() => toggleRunDetails(run.run_id)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {expandedRun === run.run_id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="text-sm font-medium">
                          {new Date(run.started_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <Badge variant="outline" className="text-xs">{run.total_questions}q</Badge>
                        {run.run_label && <Badge variant="secondary" className="text-xs">{run.run_label}</Badge>}
                        {run.run_mode && run.run_mode !== 'retrieval' && <Badge className="bg-purple-100 text-purple-700 text-xs">{run.run_mode}</Badge>}
                        {idx === 0 && <Badge className="bg-blue-100 text-blue-700 text-xs">Dernier</Badge>}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>R@5: <span className={metricColor(parseFloat(String(run.avg_recall_5)))}>{pct0(run.avg_recall_5)}</span></span>
                        <span>MRR: <span className={metricColor(parseFloat(String(run.avg_mrr)))}>{pct0(run.avg_mrr)}</span></span>
                        <span>Faith: {pct0(run.avg_faithfulness)}</span>
                        {run.avg_judge_score !== null && run.avg_judge_score !== undefined && (
                          <span>Judge: {pct0(run.avg_judge_score)}</span>
                        )}
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
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground">R@1</span>
                            <span className="ml-2 font-medium">{pct(runDetails[run.run_id].summary.avg_recall_1)}</span>
                          </div>
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground">R@3</span>
                            <span className="ml-2 font-medium">{pct(runDetails[run.run_id].summary.avg_recall_3)}</span>
                          </div>
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground">P@5</span>
                            <span className="ml-2 font-medium">{pct(runDetails[run.run_id].summary.avg_precision_5)}</span>
                          </div>
                          <div className="bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground">R@10</span>
                            <span className="ml-2 font-medium">{pct(runDetails[run.run_id].summary.avg_recall_10)}</span>
                          </div>
                        </div>

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
      )}

      {/* ==================== ONGLET BREAKDOWN ==================== */}
      {activeTab === 'breakdown' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={breakdownRunId || ''}
              onChange={e => {
                if (e.target.value) fetchBreakdown(e.target.value)
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sélectionner un run...</option>
              {runs.map(r => (
                <option key={r.run_id} value={r.run_id}>{runDisplayName(r)}</option>
              ))}
            </select>
          </div>

          {breakdownData && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Par domaine */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Par domaine
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1">Domaine</th>
                        <th className="text-right">N</th>
                        <th className="text-right">R@5</th>
                        <th className="text-right">MRR</th>
                        <th className="text-right">Faith</th>
                        {breakdownData.domain.some(d => d.avg_judge_score !== null) && <th className="text-right">Judge</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownData.domain.map(d => (
                        <tr key={d.domain} className="border-b border-muted/30">
                          <td className="py-1 font-medium">{d.domain}</td>
                          <td className="text-right">{d.count}</td>
                          <td className={`text-right ${metricColor(parseFloat(String(d.avg_recall_5)))}`}>{pct0(d.avg_recall_5)}</td>
                          <td className={`text-right ${metricColor(parseFloat(String(d.avg_mrr)))}`}>{pct0(d.avg_mrr)}</td>
                          <td className="text-right">{pct0(d.avg_faithfulness)}</td>
                          {breakdownData.domain.some(dd => dd.avg_judge_score !== null) && (
                            <td className="text-right">{d.avg_judge_score !== null ? pct0(d.avg_judge_score) : '-'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Par difficulté */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Par difficulté
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b">
                        <th className="text-left py-1">Difficulté</th>
                        <th className="text-right">N</th>
                        <th className="text-right">R@5</th>
                        <th className="text-right">MRR</th>
                        <th className="text-right">Faith</th>
                        {breakdownData.difficulty.some(d => d.avg_judge_score !== null) && <th className="text-right">Judge</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownData.difficulty.map(d => (
                        <tr key={d.difficulty} className="border-b border-muted/30">
                          <td className="py-1 font-medium">{d.difficulty}</td>
                          <td className="text-right">{d.count}</td>
                          <td className={`text-right ${metricColor(parseFloat(String(d.avg_recall_5)))}`}>{pct0(d.avg_recall_5)}</td>
                          <td className={`text-right ${metricColor(parseFloat(String(d.avg_mrr)))}`}>{pct0(d.avg_mrr)}</td>
                          <td className="text-right">{pct0(d.avg_faithfulness)}</td>
                          {breakdownData.difficulty.some(dd => dd.avg_judge_score !== null) && (
                            <td className="text-right">{d.avg_judge_score !== null ? pct0(d.avg_judge_score) : '-'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {!breakdownData && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sélectionnez un run pour voir le breakdown par domaine et difficulté.
            </p>
          )}
        </div>
      )}

      {/* ==================== ONGLET COMPARAISON A/B ==================== */}
      {activeTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Run A:</span>
              <select
                value={compareRunA || ''}
                onChange={e => setCompareRunA(e.target.value || null)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sélectionner...</option>
                {runs.map(r => (
                  <option key={r.run_id} value={r.run_id}>{runDisplayName(r)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Run B:</span>
              <select
                value={compareRunB || ''}
                onChange={e => setCompareRunB(e.target.value || null)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Sélectionner...</option>
                {runs.map(r => (
                  <option key={r.run_id} value={r.run_id}>{runDisplayName(r)}</option>
                ))}
              </select>
            </div>
            <Button
              onClick={fetchCompare}
              disabled={!compareRunA || !compareRunB || compareLoading}
              size="sm"
            >
              {compareLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitCompareArrows className="h-4 w-4 mr-2" />}
              Comparer
            </Button>
          </div>

          {compareResult && (
            <div className="space-y-4">
              {/* Alerte régression */}
              {compareResult.regressionDetected && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  Régression détectée : Recall@5 ou MRR a chuté de plus de 5%
                </div>
              )}

              {/* Delta cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <DeltaCard label="Recall@5" valueA={pct(compareResult.runA.metrics.avg_recall_5)} valueB={pct(compareResult.runB.metrics.avg_recall_5)} delta={compareResult.deltas.avg_recall_5} />
                <DeltaCard label="MRR" valueA={pct(compareResult.runA.metrics.avg_mrr)} valueB={pct(compareResult.runB.metrics.avg_mrr)} delta={compareResult.deltas.avg_mrr} />
                <DeltaCard label="Faithfulness" valueA={pct(compareResult.runA.metrics.avg_faithfulness)} valueB={pct(compareResult.runB.metrics.avg_faithfulness)} delta={compareResult.deltas.avg_faithfulness} />
                <DeltaCard label="Citations" valueA={pct(compareResult.runA.metrics.avg_citation_accuracy)} valueB={pct(compareResult.runB.metrics.avg_citation_accuracy)} delta={compareResult.deltas.avg_citation_accuracy} />
                <DeltaCard label="Latence" valueA={`${compareResult.runA.metrics.avg_latency_ms.toFixed(0)}ms`} valueB={`${compareResult.runB.metrics.avg_latency_ms.toFixed(0)}ms`} delta={compareResult.deltas.avg_latency_ms} isLatency />
              </div>

              {/* Diff par domaine */}
              {compareResult.perDomain.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Diff par domaine</CardTitle></CardHeader>
                  <CardContent>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b">
                          <th className="text-left py-1">Domaine</th>
                          <th className="text-right">R@5 (A)</th>
                          <th className="text-right">R@5 (B)</th>
                          <th className="text-right">Delta</th>
                          <th className="text-right">MRR (A)</th>
                          <th className="text-right">MRR (B)</th>
                          <th className="text-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareResult.perDomain.map(d => (
                          <tr key={d.domain} className="border-b border-muted/30">
                            <td className="py-1 font-medium">{d.domain}</td>
                            <td className="text-right">{pct0(d.recall_5_a)}</td>
                            <td className="text-right">{pct0(d.recall_5_b)}</td>
                            <td className={`text-right font-medium ${deltaColor(parseFloat(String(d.delta_recall_5)))}`}>
                              {formatDelta(parseFloat(String(d.delta_recall_5)))}
                            </td>
                            <td className="text-right">{pct0(d.mrr_a)}</td>
                            <td className="text-right">{pct0(d.mrr_b)}</td>
                            <td className={`text-right font-medium ${deltaColor(parseFloat(String(d.delta_mrr)))}`}>
                              {formatDelta(parseFloat(String(d.delta_mrr)))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Diff par question */}
              {compareResult.perQuestion.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Diff par question (trié par |delta| desc)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="max-h-96 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-background">
                          <tr className="text-muted-foreground border-b">
                            <th className="text-left py-1">Question</th>
                            <th className="text-right">R@5 A</th>
                            <th className="text-right">R@5 B</th>
                            <th className="text-right">Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareResult.perQuestion.map((q: QuestionDiff) => (
                            <tr key={q.question_id} className="border-b border-muted/30">
                              <td className="py-1 max-w-xs truncate" dir="auto">{q.question}</td>
                              <td className="text-right">{pct0(q.recall_5_a)}</td>
                              <td className="text-right">{pct0(q.recall_5_b)}</td>
                              <td className={`text-right font-medium ${deltaColor(parseFloat(String(q.delta_recall_5)))}`}>
                                {formatDelta(parseFloat(String(q.delta_recall_5)))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {!compareResult && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sélectionnez deux runs et cliquez Comparer.
            </p>
          )}
        </div>
      )}

      {/* ==================== ONGLET QUALITÉ IA ==================== */}
      {activeTab === 'quality' && (
        <div className="space-y-8">
          {/* Sous-navigation */}
          <QualitySubTabs />
        </div>
      )}
    </div>
  )
}

// =============================================================================
// ONGLET QUALITÉ IA — Sous-onglets
// =============================================================================

function QualitySubTabs() {
  const [sub, setSub] = useState<'gaps' | 'review' | 'silver'>('gaps')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {([
          { id: 'gaps', label: 'Lacunes KB' },
          { id: 'review', label: 'File de Relecture' },
          { id: 'silver', label: 'Silver Dataset' },
        ] as const).map(s => (
          <button
            key={s.id}
            onClick={() => setSub(s.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              sub === s.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {sub === 'gaps' && <KnowledgeGapsTab />}
      {sub === 'review' && <ReviewQueueTab />}
      {sub === 'silver' && <SilverDatasetTab />}
    </div>
  )
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function ScoreCard({ label, value, color, trend }: { label: string; value: string; color: string; trend?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${color}`}>
          {value}
          {trend}
        </p>
      </CardContent>
    </Card>
  )
}

function DeltaCard({ label, valueA, valueB, delta, isLatency }: { label: string; valueA: string; valueB: string; delta: number; isLatency?: boolean }) {
  // For latency, lower is better (negative delta = improvement)
  const isImproved = isLatency ? delta < -10 : delta > 0.01
  const isRegressed = isLatency ? delta > 10 : delta < -0.01

  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-sm">{valueA}</span>
          <span className="text-xs text-muted-foreground">&rarr;</span>
          <span className="text-sm font-medium">{valueB}</span>
        </div>
        <p className={`text-xs font-medium mt-1 ${isImproved ? 'text-green-600' : isRegressed ? 'text-red-600' : 'text-muted-foreground'}`}>
          {isLatency
            ? `${delta > 0 ? '+' : ''}${delta.toFixed(0)}ms`
            : formatDelta(delta)
          }
        </p>
      </CardContent>
    </Card>
  )
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : ''
  return `${sign}${(delta * 100).toFixed(1)}%`
}
