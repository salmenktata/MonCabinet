'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  Database,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  Sparkles,
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface ChunksHealthData {
  embedding: {
    totalChunks: number
    ollamaCount: number
    missingEmbeddings: number
    ollamaCoverage: number
    byCategory: Array<{
      category: string
      total: number
      withEmbedding: number
      coverage: number
    }>
  }
  chunks: {
    totalChunks: number
    avgChunkLength: number
    shortChunks: number
    emptyChunks: number
    docsWithZeroChunks: number
    byCategory: Array<{
      category: string
      count: number
      avgLength: number
      shortCount: number
      shortPct: number
    }>
  }
  quality: {
    totalDocs: number
    withScore: number
    withoutScore: number
    avgScore: number
    coverage: number
    likelyFailures: number
    distribution: Array<{ range: string; count: number }>
  }
}

type ActionResult = { type: 'success' | 'error'; message: string }

// =============================================================================
// HELPERS
// =============================================================================

function coverageColor(pct: number) {
  if (pct >= 90) return 'text-green-600'
  if (pct >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

function categoryLabel(cat: string) {
  const labels: Record<string, string> = {
    codes: 'Codes',
    legislation: 'Législation',
    jurisprudence: 'Jurisprudence',
    doctrine: 'Doctrine',
    procedures: 'Procédures',
    constitution: 'Constitution',
    autre: 'Autre',
  }
  return labels[cat] ?? cat
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function ChunksHealthClient() {
  const [data, setData] = useState<ChunksHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)

  // Action loading states
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [rechunkLoading, setRechunkLoading] = useState(false)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [reanalyzeLoading, setReanalyzeLoading] = useState(false)
  const [enrichLoading, setEnrichLoading] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/admin/kb/chunks-health')
      if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Erreur API')
      setData(json)
      setLastUpdate(new Date())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const runAction = async (
    setter: (v: boolean) => void,
    fn: () => Promise<Response>,
    parseResult: (json: Record<string, unknown>) => string
  ) => {
    setter(true)
    setActionResult(null)
    try {
      const res = await fn()
      const json = await res.json() as Record<string, unknown>
      if (res.ok && (json.success !== false)) {
        setActionResult({ type: 'success', message: parseResult(json) })
        await fetchData()
      } else {
        setActionResult({ type: 'error', message: (json.error as string) || 'Erreur' })
      }
    } catch {
      setActionResult({ type: 'error', message: 'Erreur réseau' })
    } finally {
      setter(false)
    }
  }

  const handleBackfill = () =>
    runAction(
      setBackfillLoading,
      () => fetch('/api/admin/backfill-ollama?batches=50'),
      (j) => `${j.backfilled} chunks backfillés, ${j.remaining} restants`
    )

  const handleRechunk = () =>
    runAction(
      setRechunkLoading,
      () => fetch('/api/admin/kb/reindex-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 3 }),
      }),
      (j) => (j.message as string) || `${j.processed ?? 0} docs rechunkés`
    )

  const handleAnalyze = () =>
    runAction(
      setAnalyzeLoading,
      () => fetch('/api/admin/kb/analyze-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20 }),
      }),
      (j) => (j.message as string) || `${j.succeeded ?? 0}/${j.analyzed ?? 0} analysés`
    )

  const handleReanalyze = () =>
    runAction(
      setReanalyzeLoading,
      () => fetch('/api/admin/kb/reanalyze-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 50 }),
      }),
      (j) => {
        const stats = j.stats as Record<string, number> | undefined
        if (stats) return `${stats.succeeded ?? 0}/${stats.total ?? 0} réanalysés, ${stats.improved ?? 0} améliorés`
        return (j.message as string) || 'Réanalyse terminée'
      }
    )

  const handleEnrich = () =>
    runAction(
      setEnrichLoading,
      () => fetch('/api/admin/kb/enrich-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 10, reanalyzeAfter: true }),
      }),
      (j) => (j.message as string) || `${j.enriched ?? 0} docs enrichis`
    )

  // --- États de chargement ---
  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Chargement des métriques...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
          <p className="mt-4 text-sm text-muted-foreground">{error}</p>
          <Button onClick={fetchData} className="mt-4">Réessayer</Button>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { embedding, chunks, quality } = data

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Santé Chunks & Embeddings</h1>
          <p className="text-muted-foreground">
            Couverture embeddings, qualité des chunks et scores documents
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-sm text-muted-foreground">
              MAJ : {lastUpdate.toLocaleTimeString('fr-FR')}
            </span>
          )}
          <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Résultat action */}
      {actionResult && (
        <Alert variant={actionResult.type === 'error' ? 'destructive' : 'default'}>
          {actionResult.type === 'success'
            ? <CheckCircle2 className="h-4 w-4" />
            : <AlertTriangle className="h-4 w-4" />
          }
          <AlertDescription>{actionResult.message}</AlertDescription>
        </Alert>
      )}

      {/* KPIs globaux */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chunks totaux</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{chunks.totalChunks.toLocaleString('fr-FR')}</div>
            <p className="text-xs text-muted-foreground">Taille moy. {chunks.avgChunkLength} chars</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Couverture Ollama</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${coverageColor(embedding.ollamaCoverage)}`}>
              {embedding.ollamaCoverage.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {embedding.missingEmbeddings.toLocaleString('fr-FR')} manquants
            </p>
            <Progress value={embedding.ollamaCoverage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Qualité analysée</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${coverageColor(quality.coverage)}`}>
              {quality.coverage}%
            </div>
            <p className="text-xs text-muted-foreground">
              Score moy. <span className={scoreColor(quality.avgScore)}>{quality.avgScore.toFixed(1)}/100</span>
            </p>
            <Progress value={quality.coverage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Anomalies</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {(chunks.shortChunks + chunks.emptyChunks + chunks.docsWithZeroChunks + quality.likelyFailures).toLocaleString('fr-FR')}
            </div>
            <p className="text-xs text-muted-foreground">
              {chunks.shortChunks} courts · {quality.likelyFailures} échecs score
            </p>
            {chunks.docsWithZeroChunks > 0 && (
              <Badge variant="destructive" className="mt-2 text-xs">
                {chunks.docsWithZeroChunks} docs sans chunks
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="embeddings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="embeddings" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Embeddings
            {embedding.missingEmbeddings > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1 text-xs">
                {embedding.missingEmbeddings}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="chunks" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Chunks
            {(chunks.shortChunks + chunks.emptyChunks) > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                {chunks.shortChunks + chunks.emptyChunks}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="qualite" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Qualité
            {quality.withoutScore > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1 text-xs">
                {quality.withoutScore}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------------------ */}
        {/* ONGLET EMBEDDINGS                                                   */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="embeddings" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Couverture Embeddings Ollama</h2>
              <p className="text-sm text-muted-foreground">
                nomic-embed-text 768-dim — requis pour la recherche vectorielle RAG
              </p>
            </div>
            <Button
              onClick={handleBackfill}
              disabled={backfillLoading || embedding.missingEmbeddings === 0}
              variant={embedding.missingEmbeddings > 0 ? 'default' : 'outline'}
              size="sm"
            >
              <Zap className={`h-4 w-4 mr-2 ${backfillLoading ? 'animate-spin' : ''}`} />
              {backfillLoading ? 'Backfill en cours...' : `Backfill Ollama (${embedding.missingEmbeddings.toLocaleString('fr-FR')} manquants)`}
            </Button>
          </div>

          {/* Stat globale */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Couverture globale</span>
                <span className={`text-lg font-bold ${coverageColor(embedding.ollamaCoverage)}`}>
                  {embedding.ollamaCount.toLocaleString('fr-FR')} / {embedding.totalChunks.toLocaleString('fr-FR')}
                  {' '}({embedding.ollamaCoverage.toFixed(1)}%)
                </span>
              </div>
              <Progress value={embedding.ollamaCoverage} className="h-3" />
              {embedding.missingEmbeddings > 0 && (
                <p className="mt-2 text-sm text-orange-600">
                  {embedding.missingEmbeddings.toLocaleString('fr-FR')} chunks sans embedding — la recherche RAG est dégradée pour ces documents
                </p>
              )}
            </CardContent>
          </Card>

          {/* Breakdown par catégorie */}
          <Card>
            <CardHeader>
              <CardTitle>Par catégorie</CardTitle>
              <CardDescription>Couverture embedding Ollama par type de document</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {embedding.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{categoryLabel(cat.category)}</span>
                      <div className="flex items-center gap-3 text-muted-foreground">
                        <span>{cat.withEmbedding.toLocaleString('fr-FR')} / {cat.total.toLocaleString('fr-FR')}</span>
                        <span className={`font-semibold ${coverageColor(cat.coverage)}`}>
                          {cat.coverage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <Progress value={cat.coverage} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ONGLET CHUNKS                                                       */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="chunks" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Qualité des Chunks</h2>
              <p className="text-sm text-muted-foreground">
                Taille, anomalies et documents sans chunks valides
              </p>
            </div>
            <Button
              onClick={handleRechunk}
              disabled={rechunkLoading}
              variant="outline"
              size="sm"
            >
              <FileText className={`h-4 w-4 mr-2 ${rechunkLoading ? 'animate-spin' : ''}`} />
              {rechunkLoading ? 'Rechunk en cours...' : 'Re-chunker articles (batch 3)'}
            </Button>
          </div>

          {/* Stats globales */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{chunks.avgChunkLength}</div>
                <p className="text-sm text-muted-foreground">Taille moyenne (chars)</p>
                {chunks.avgChunkLength < 200 && (
                  <Badge variant="secondary" className="mt-2">Chunks courts en moyenne</Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${chunks.shortChunks > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {chunks.shortChunks.toLocaleString('fr-FR')}
                </div>
                <p className="text-sm text-muted-foreground">Chunks courts (&lt;100 chars)</p>
                {chunks.shortChunks > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {((chunks.shortChunks / chunks.totalChunks) * 100).toFixed(1)}% du total
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${chunks.docsWithZeroChunks > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {chunks.docsWithZeroChunks}
                </div>
                <p className="text-sm text-muted-foreground">Docs indexés sans chunks</p>
                {chunks.docsWithZeroChunks > 0 && (
                  <Badge variant="destructive" className="mt-2">À réindexer</Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Breakdown par catégorie */}
          <Card>
            <CardHeader>
              <CardTitle>Par catégorie</CardTitle>
              <CardDescription>Distribution des chunks et anomalies par type de document</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-left font-medium">Catégorie</th>
                      <th className="pb-2 text-right font-medium">Chunks</th>
                      <th className="pb-2 text-right font-medium">Taille moy.</th>
                      <th className="pb-2 text-right font-medium">Courts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.byCategory.map((cat) => (
                      <tr key={cat.category} className="border-b last:border-0">
                        <td className="py-2 font-medium">{categoryLabel(cat.category)}</td>
                        <td className="py-2 text-right">{cat.count.toLocaleString('fr-FR')}</td>
                        <td className="py-2 text-right">{cat.avgLength}</td>
                        <td className="py-2 text-right">
                          {cat.shortCount > 0 ? (
                            <span className="text-orange-600">
                              {cat.shortCount} ({cat.shortPct.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------------ */}
        {/* ONGLET QUALITÉ                                                      */}
        {/* ------------------------------------------------------------------ */}
        <TabsContent value="qualite" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Scores Qualité Documents</h2>
              <p className="text-sm text-muted-foreground">
                Analyse LLM (clarté, structure, complétude, fiabilité)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleEnrich}
                disabled={enrichLoading}
                variant="outline"
                size="sm"
                title="Enrichir descriptions et tags via LLM (batch 10)"
              >
                <Sparkles className={`h-4 w-4 mr-2 ${enrichLoading ? 'animate-spin' : ''}`} />
                {enrichLoading ? 'Enrichissement...' : 'Enrichir métadonnées'}
              </Button>
              {quality.likelyFailures > 0 && (
                <Button
                  onClick={handleReanalyze}
                  disabled={reanalyzeLoading}
                  variant="outline"
                  size="sm"
                  className="border-orange-400 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  title={`Réanalyser les ${quality.likelyFailures} docs avec score=50 (échecs LLM)`}
                >
                  <AlertTriangle className={`h-4 w-4 mr-2 ${reanalyzeLoading ? 'animate-spin' : ''}`} />
                  {reanalyzeLoading ? 'Réanalyse...' : `Réanalyser échecs (${quality.likelyFailures})`}
                </Button>
              )}
              <Button
                onClick={handleAnalyze}
                disabled={analyzeLoading || quality.withoutScore === 0}
                size="sm"
              >
                <Activity className={`h-4 w-4 mr-2 ${analyzeLoading ? 'animate-spin' : ''}`} />
                {analyzeLoading ? 'Analyse...' : `Analyser batch (${quality.withoutScore} restants)`}
              </Button>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${coverageColor(quality.coverage)}`}>
                  {quality.coverage}%
                </div>
                <p className="text-sm text-muted-foreground">Documents analysés</p>
                <Progress value={quality.coverage} className="mt-2" />
                <p className="mt-1 text-xs text-muted-foreground">
                  {quality.withScore.toLocaleString('fr-FR')} / {quality.totalDocs.toLocaleString('fr-FR')} docs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${scoreColor(quality.avgScore)}`}>
                  {quality.avgScore.toFixed(1)}/100
                </div>
                <p className="text-sm text-muted-foreground">Score moyen</p>
                {quality.avgScore >= 80 ? (
                  <Badge className="mt-2 bg-green-600">Excellente qualité</Badge>
                ) : quality.avgScore >= 70 ? (
                  <Badge variant="secondary" className="mt-2">Bonne qualité</Badge>
                ) : (
                  <Badge variant="destructive" className="mt-2">À améliorer</Badge>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className={`text-2xl font-bold ${quality.likelyFailures > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {quality.likelyFailures}
                </div>
                <p className="text-sm text-muted-foreground">Échecs LLM (score=50)</p>
                {quality.likelyFailures === 0 ? (
                  <Badge className="mt-2 bg-green-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Aucun échec
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="mt-2">À réanalyser</Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Distribution des scores</CardTitle>
              <CardDescription>Répartition par tranche de qualité</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {quality.distribution.map((band) => {
                  const pct = quality.withScore > 0
                    ? Math.round((band.count / quality.withScore) * 100)
                    : 0
                  const isNonAnalyzed = band.range === 'Non analysé'
                  return (
                    <div key={band.range} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className={`font-medium ${isNonAnalyzed ? 'text-muted-foreground' : ''}`}>
                          {band.range}
                        </span>
                        <span className="text-muted-foreground">
                          {band.count.toLocaleString('fr-FR')} docs ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isNonAnalyzed ? 'bg-muted-foreground/30' :
                            band.range.includes('Faible') ? 'bg-red-500' :
                            band.range.includes('Moyen') ? 'bg-yellow-500' :
                            band.range.includes('Bon') ? 'bg-blue-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
