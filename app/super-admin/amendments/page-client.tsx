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
// COULEURS PAR TYPE D'AMENDEMENT
// =============================================================================

function getAmendmentTypeBadge(type: string | null) {
  switch (type) {
    case 'modification':
      return <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 dark:bg-blue-950/20 text-xs">Modification</Badge>
    case 'abrogation':
      return <Badge variant="outline" className="text-red-700 border-red-300 bg-red-50 dark:bg-red-950/20 text-xs">Abrogation</Badge>
    case 'addition':
      return <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 dark:bg-green-950/20 text-xs">Addition</Badge>
    case 'replacement':
      return <Badge variant="outline" className="text-purple-700 border-purple-300 bg-purple-50 dark:bg-purple-950/20 text-xs">Remplacement</Badge>
    default:
      return <Badge variant="outline" className="text-xs">{type ?? '—'}</Badge>
  }
}

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function AmendmentsDashboardClient() {
  const [data, setData] = useState<AmendmentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [codeFilter, setCodeFilter] = useState<string>('all')
  const [batchRunning, setBatchRunning] = useState(false)

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

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Amendements JORT"
        description="Suivi des modifications législatives publiées au Journal Officiel de la République Tunisienne"
        backHref="/super-admin/monitoring"
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
      {data && (
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
            label="Docs IORT indexés"
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
                ({data.amendments.length})
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

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Icons.loader className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && data && data.amendments.length === 0 && (
          <EmptyState
            icon="fileSearch"
            message="Aucun amendement détecté pour ce filtre"
          />
        )}

        {!loading && data && data.amendments.length > 0 && (
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
                          row.confidence >= 0.8 ? 'text-green-600' :
                          row.confidence >= 0.6 ? 'text-amber-600' :
                          'text-red-600'
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
        )}
      </div>
    </div>
  )
}
