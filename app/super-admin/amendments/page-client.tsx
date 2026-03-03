'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'
import { KPICard } from '@/components/super-admin/shared/KPICard'
import { EmptyState } from '@/components/super-admin/shared/EmptyState'
import { Icons } from '@/lib/icons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// =============================================================================
// TYPES BENCHMARK
// =============================================================================

interface BenchmarkMetrics {
  tp: number; tn: number; fp: number; fn: number
  precision: number | null; recall: number | null; f1: number | null
}

interface BenchmarkExtraction {
  codeAccuracy: number | null
  articlesJaccard: number | null
  typeAccuracy: number | null
  dateAccuracy: number | null
}

interface BenchmarkCase {
  id: string
  title: string
  expected: { isAmending: boolean; code: string | null; articles: number[]; type: string | null; date: string | null }
  detected: { preFilter: boolean; isAmending: boolean; code: string | null; articles: number[]; type: string | null; date: string | null; confidence: number | null; method: string | null }
  outcome: 'TP' | 'TN' | 'FP' | 'FN'
  preFilterOutcome: 'TP' | 'TN' | 'FP' | 'FN'
  error: string | null
}

interface BenchmarkData {
  meta: { totalCases: number; skipped: number; ranAt: string }
  detection: BenchmarkMetrics
  preFilter: BenchmarkMetrics
  extraction: BenchmarkExtraction
  cases: BenchmarkCase[]
}

interface SampleResult {
  id: string
  title: string
  preFilterResult: boolean
  detectedAmending: boolean
  detectedCode: string | null
  detectedArticles: number[]
  detectedType: string | null
  detectedDate: string | null
  confidence: number | null
  extractionMethod: string | null
  error: string | null
}

interface SampleData {
  count: number
  detectedPositives: number
  preFilterPositives: number
  results: SampleResult[]
}

// =============================================================================
// TYPES
// =============================================================================

interface AmendmentStats {
  totalAmendments: number
  codesCovered: number
  totalIortDocs: number
  pendingExtraction: number
}

interface CodeCoverage {
  codeSlug: string
  nameAr?: string
  nameFr?: string
  jortCount: number
  articleCount: number
}

interface AmendmentRow {
  jortKbId: string
  jortTitle: string
  codeSlug: string
  codeNameAr?: string
  codeNameFr?: string
  amendedArticles: number[] | null
  amendmentType: string | null
  jortDate: string | null
  jortIssue: string | null
  confidence: number | null
  relationsCount: number
}

interface AmendmentsData {
  stats: AmendmentStats
  coverage: CodeCoverage[]
  amendments: AmendmentRow[]
  pagination: { limit: number; offset: number; total: number }
}

// =============================================================================
// BADGES TYPE D'AMENDEMENT — couleurs compatibles dark mode
// =============================================================================

function getAmendmentTypeBadge(type: string | null) {
  switch (type) {
    case 'modification':
      return (
        <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/10 text-xs">
          Modification
        </Badge>
      )
    case 'abrogation':
      return (
        <Badge variant="outline" className="text-red-400 border-red-500/30 bg-red-500/10 text-xs">
          Abrogation
        </Badge>
      )
    case 'addition':
      return (
        <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10 text-xs">
          Addition
        </Badge>
      )
    case 'replacement':
      return (
        <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/10 text-xs">
          Remplacement
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-slate-400 border-slate-600 text-xs">
          {type ?? '—'}
        </Badge>
      )
  }
}

// =============================================================================
// SKELETON CHARGEMENT
// =============================================================================

function KPIsSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl bg-slate-800 border border-slate-700 p-5 animate-pulse">
          <div className="h-7 w-16 bg-slate-700 rounded mb-2" />
          <div className="h-3 w-24 bg-slate-700 rounded" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-2 py-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="h-10 flex-[2] bg-muted rounded" />
          <div className="h-10 flex-1 bg-muted rounded" />
          <div className="h-10 flex-1 bg-muted rounded" />
          <div className="h-10 w-24 bg-muted rounded" />
          <div className="h-10 w-20 bg-muted rounded" />
          <div className="h-10 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function AmendmentsDashboardClient() {
  const [data, setData] = useState<AmendmentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [codeFilter, setCodeFilter] = useState<string>('all')
  const [batchRunning, setBatchRunning] = useState(false)

  // Benchmark state
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null)
  const [benchmarkRunning, setBenchmarkRunning] = useState(false)
  const [sampleData, setSampleData] = useState<SampleData | null>(null)
  const [sampleRunning, setSampleRunning] = useState(false)
  const [showBenchmark, setShowBenchmark] = useState(false)

  const loadData = useCallback(async (code?: string) => {
    setLoading(true)
    try {
      const url = new URL('/api/admin/amendments', window.location.origin)
      if (code && code !== 'all') url.searchParams.set('code', code)
      url.searchParams.set('limit', '100')

      const res = await fetch(url.toString())
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (err) {
      toast.error('Erreur chargement amendements')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(codeFilter !== 'all' ? codeFilter : undefined)
  }, [codeFilter, loadData])

  const handleBatchExtract = async (dryRun = false) => {
    setBatchRunning(true)
    const toastId = toast.loading(
      dryRun ? 'Simulation en cours...' : 'Extraction en cours...',
      { description: 'Analyse des documents JORT non traités' }
    )
    try {
      const res = await fetch('/api/admin/amendments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20, dryRun }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      if (dryRun) {
        toast.success(`Simulation : ${result.pendingCount} documents à traiter`, { id: toastId })
      } else {
        toast.success(
          `Extraction terminée : ${result.withAmendments}/${result.processed} avec amendements`,
          { id: toastId, description: `${result.errors} erreur(s)` }
        )
        await loadData()
      }
    } catch (err) {
      toast.error('Erreur batch extraction', { id: toastId })
    } finally {
      setBatchRunning(false)
    }
  }

  const handleRunBenchmark = async () => {
    setBenchmarkRunning(true)
    const toastId = toast.loading('Benchmark en cours...', { description: 'Exécution sur le gold dataset' })
    try {
      const res = await fetch('/api/admin/amendments/benchmark')
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setBenchmarkData(result)
      setShowBenchmark(true)
      toast.success(
        `Benchmark terminé — F1: ${result.detection.f1 !== null ? Math.round(result.detection.f1 * 100) + '%' : 'N/A'}`,
        { id: toastId, description: `${result.meta.totalCases} cas testés` }
      )
    } catch (err) {
      toast.error('Erreur benchmark', { id: toastId })
    } finally {
      setBenchmarkRunning(false)
    }
  }

  const handleRunSample = async () => {
    setSampleRunning(true)
    const toastId = toast.loading('Sampling en cours...', { description: 'Sélection aléatoire de 30 docs JORT' })
    try {
      const res = await fetch('/api/admin/amendments/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 30, excludeAlreadyGold: true }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setSampleData(result)
      setShowBenchmark(true)
      toast.success(
        `Sampling terminé — ${result.detectedPositives}/${result.count} amendements détectés`,
        { id: toastId }
      )
    } catch (err) {
      toast.error('Erreur sampling', { id: toastId })
    } finally {
      setSampleRunning(false)
    }
  }

  const showingCount = data?.amendments.length ?? 0
  const totalCount = data?.pagination.total ?? 0

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Amendements JORT"
        description="Suivi des modifications législatives publiées au Journal Officiel de la République Tunisienne"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchExtract(true)}
              disabled={batchRunning}
            >
              <Icons.eye className="h-4 w-4 mr-2" />
              Simuler
            </Button>
            <Button
              size="sm"
              onClick={() => handleBatchExtract(false)}
              disabled={batchRunning || loading}
            >
              {batchRunning ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.play className="h-4 w-4 mr-2" />
              )}
              Extraire tout
            </Button>
          </div>
        }
      />

      {/* KPIs */}
      {!data ? (
        <KPIsSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            label="Amendements détectés"
            value={data.stats.totalAmendments}
            icon="edit"
            color="blue"
          />
          <KPICard
            label="Codes couverts"
            value={data.stats.codesCovered}
            icon="bookOpen"
            color="green"
          />
          <KPICard
            label="Docs JORT indexés"
            value={data.stats.totalIortDocs}
            icon="fileText"
            color="purple"
          />
          <KPICard
            label="En attente d'analyse"
            value={data.stats.pendingExtraction}
            icon="clock"
            color={data.stats.pendingExtraction > 0 ? 'yellow' : 'green'}
          />
        </div>
      )}

      {/* Couverture par code */}
      {data && data.coverage.length > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Icons.barChart className="h-4 w-4 text-primary" />
            Couverture par code juridique
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {data.coverage.map((code) => (
              <button
                key={code.codeSlug}
                className={cn(
                  'text-left p-3 rounded-lg border transition-all hover:shadow-sm',
                  codeFilter === code.codeSlug
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                )}
                onClick={() => setCodeFilter(
                  codeFilter === code.codeSlug ? 'all' : code.codeSlug
                )}
              >
                <div className="font-semibold text-sm">{code.codeSlug}</div>
                {code.nameAr && (
                  <div className="text-xs text-muted-foreground mt-0.5 truncate" dir="rtl">
                    {code.nameAr}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{code.jortCount} JORT</span>
                  <span>·</span>
                  <span>{code.articleCount} art.</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtre et liste */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Icons.list className="h-4 w-4 text-primary" />
            {codeFilter !== 'all'
              ? `Amendements — ${codeFilter}`
              : 'Tous les amendements'}
            {data && (
              <span className="text-xs text-muted-foreground font-normal">
                ({showingCount}{totalCount > showingCount ? ` / ${totalCount}` : ''})
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCodeFilter('all')}
            className="text-xs"
            disabled={codeFilter === 'all'}
          >
            <Icons.x className="h-3 w-3 mr-1" />
            Effacer filtre
          </Button>
        </div>

        {loading && <TableSkeleton />}

        {!loading && data && data.amendments.length === 0 && (
          <EmptyState
            icon="fileSearch"
            message="Aucun amendement détecté pour ce filtre"
          />
        )}

        {!loading && data && data.amendments.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Document JORT</th>
                    <th className="pb-2 pr-4 font-medium">Code modifié</th>
                    <th className="pb-2 pr-4 font-medium">Articles</th>
                    <th className="pb-2 pr-4 font-medium">Type</th>
                    <th className="pb-2 pr-4 font-medium">Date JORT</th>
                    <th className="pb-2 pr-4 font-medium">Confiance</th>
                    <th className="pb-2 font-medium">Relations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {data.amendments.map((row) => (
                    <tr key={`${row.jortKbId}-${row.codeSlug}`} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4">
                        <div className="text-xs font-medium max-w-[200px] truncate" title={row.jortTitle}>
                          {row.jortTitle}
                        </div>
                        {row.jortIssue && (
                          <div className="text-[11px] text-muted-foreground">{row.jortIssue}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-xs">{row.codeSlug}</div>
                        {row.codeNameAr && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[120px]" dir="rtl">
                            {row.codeNameAr}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {row.amendedArticles?.slice(0, 5).map((n) => (
                            <span key={n} className="px-1 py-0.5 bg-muted rounded text-[10px] font-mono">
                              {n}
                            </span>
                          ))}
                          {(row.amendedArticles?.length ?? 0) > 5 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{(row.amendedArticles?.length ?? 0) - 5}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        {getAmendmentTypeBadge(row.amendmentType)}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        {row.jortDate ?? '—'}
                      </td>
                      <td className="py-3 pr-4">
                        {row.confidence !== null ? (
                          <span className={cn(
                            'text-xs font-medium',
                            row.confidence >= 0.8 ? 'text-green-400' :
                            row.confidence >= 0.6 ? 'text-amber-400' :
                            'text-red-400'
                          )}>
                            {Math.round(row.confidence * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {row.relationsCount}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Compteur pagination */}
            {totalCount > showingCount && (
              <div className="mt-4 pt-3 border-t border-border/40 text-xs text-muted-foreground text-center">
                Affichage de {showingCount} sur {totalCount} amendements — utilisez les filtres par code pour affiner
              </div>
            )}
          </>
        )}
      </div>

      {/* ===================================================================
          SECTION BENCHMARK & QUALITÉ
          =================================================================== */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Icons.barChart className="h-4 w-4 text-primary" />
            Benchmark & Qualité
          </h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunSample}
              disabled={sampleRunning || benchmarkRunning}
            >
              {sampleRunning ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.fileSearch className="h-4 w-4 mr-2" />
              )}
              Sampler 30 docs
            </Button>
            <Button
              size="sm"
              onClick={handleRunBenchmark}
              disabled={benchmarkRunning || sampleRunning}
            >
              {benchmarkRunning ? (
                <Icons.loader className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Icons.play className="h-4 w-4 mr-2" />
              )}
              Lancer benchmark
            </Button>
          </div>
        </div>

        {/* Métriques benchmark */}
        {benchmarkData && (
          <div className="space-y-4">
            {/* KPIs détection */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Précision', value: benchmarkData.detection.precision, color: 'text-blue-400' },
                { label: 'Rappel', value: benchmarkData.detection.recall, color: 'text-green-400' },
                { label: 'F1', value: benchmarkData.detection.f1, color: 'text-purple-400' },
                { label: 'Code accuracy', value: benchmarkData.extraction.codeAccuracy, color: 'text-amber-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-3 text-center">
                  <div className={cn('text-2xl font-bold', color)}>
                    {value !== null ? `${Math.round(value * 100)}%` : '—'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
                </div>
              ))}
            </div>

            {/* Métriques extraction */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Articles Jaccard', value: benchmarkData.extraction.articlesJaccard },
                { label: 'Type accuracy', value: benchmarkData.extraction.typeAccuracy },
                { label: 'Date accuracy', value: benchmarkData.extraction.dateAccuracy },
                { label: 'Pré-filtre F1', value: benchmarkData.preFilter.f1 },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-muted/20 p-2 text-center">
                  <div className="text-lg font-semibold">
                    {value !== null ? `${Math.round(value * 100)}%` : '—'}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Matrice de confusion */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="text-green-400 font-medium">TP: {benchmarkData.detection.tp}</span>
              <span className="text-slate-400">TN: {benchmarkData.detection.tn}</span>
              <span className="text-red-400 font-medium">FP: {benchmarkData.detection.fp}</span>
              <span className="text-amber-400 font-medium">FN: {benchmarkData.detection.fn}</span>
              <span className="ml-auto text-[10px]">
                {benchmarkData.meta.totalCases} cas · {new Date(benchmarkData.meta.ranAt).toLocaleString('fr-FR')}
              </span>
            </div>

            {/* Tableau des cas gold */}
            {showBenchmark && (
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Cas</th>
                      <th className="pb-2 pr-3 font-medium">Titre JORT</th>
                      <th className="pb-2 pr-3 font-medium">Attendu</th>
                      <th className="pb-2 pr-3 font-medium">Détecté</th>
                      <th className="pb-2 pr-3 font-medium">Résultat</th>
                      <th className="pb-2 font-medium">Confiance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {benchmarkData.cases.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/20">
                        <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">{c.id}</td>
                        <td className="py-2 pr-3 max-w-[180px]">
                          <span className="truncate block" title={c.title}>{c.title}</span>
                        </td>
                        <td className="py-2 pr-3">
                          {c.expected.isAmending ? (
                            <span className="text-blue-400">{c.expected.code} [{c.expected.articles?.join(', ')}]</span>
                          ) : (
                            <span className="text-slate-500">Non-modif.</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {c.detected.isAmending ? (
                            <span className="text-green-400">{c.detected.code} [{c.detected.articles?.join(', ')}]</span>
                          ) : (
                            <span className="text-slate-500">Non-modif.</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={cn(
                            'font-bold',
                            c.outcome === 'TP' ? 'text-green-400' :
                            c.outcome === 'TN' ? 'text-slate-400' :
                            c.outcome === 'FP' ? 'text-red-400' :
                            'text-amber-400'
                          )}>
                            {c.outcome}
                          </span>
                          {c.error && <span className="ml-1 text-red-400" title={c.error}>⚠</span>}
                        </td>
                        <td className="py-2">
                          {c.detected.confidence !== null ? (
                            <span className={cn(
                              'font-medium',
                              c.detected.confidence >= 0.8 ? 'text-green-400' :
                              c.detected.confidence >= 0.6 ? 'text-amber-400' : 'text-red-400'
                            )}>
                              {Math.round(c.detected.confidence * 100)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Résultats sampling */}
        {sampleData && !benchmarkData && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{sampleData.count} docs échantillonnés</span>
              <span className="text-primary font-medium">{sampleData.detectedPositives} amendements détectés</span>
              <span className="text-muted-foreground">{sampleData.preFilterPositives} passent le pré-filtre</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Titre JORT</th>
                    <th className="pb-2 pr-3 font-medium">Amendement ?</th>
                    <th className="pb-2 pr-3 font-medium">Code</th>
                    <th className="pb-2 pr-3 font-medium">Articles</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 font-medium">Confiance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {sampleData.results.map((r) => (
                    <tr key={r.id} className={cn('hover:bg-muted/20', r.detectedAmending && 'bg-green-500/5')}>
                      <td className="py-2 pr-3 max-w-[200px]">
                        <span className="truncate block" title={r.title}>{r.title}</span>
                        {r.error && <span className="text-red-400 text-[10px]">{r.error}</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {r.detectedAmending ? (
                          <Badge variant="outline" className="text-green-400 border-green-500/30 bg-green-500/10 text-[10px]">Oui</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-400 border-slate-600 text-[10px]">Non</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-semibold">{r.detectedCode ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap gap-1 max-w-[120px]">
                          {r.detectedArticles?.slice(0, 4).map((n) => (
                            <span key={n} className="px-1 bg-muted rounded font-mono">{n}</span>
                          ))}
                          {(r.detectedArticles?.length ?? 0) > 4 && (
                            <span className="text-muted-foreground">+{(r.detectedArticles?.length ?? 0) - 4}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{r.detectedType ? getAmendmentTypeBadge(r.detectedType) : '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.detectedDate ?? '—'}</td>
                      <td className="py-2">
                        {r.confidence !== null ? (
                          <span className={cn(
                            'font-medium',
                            r.confidence >= 0.8 ? 'text-green-400' :
                            r.confidence >= 0.6 ? 'text-amber-400' : 'text-red-400'
                          )}>
                            {Math.round(r.confidence * 100)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!benchmarkData && !sampleData && (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Lancez le benchmark sur le gold dataset (9 cas) ou échantillonnez des docs aléatoires pour mesurer la qualité de détection.
          </p>
        )}
      </div>
    </div>
  )
}
