'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'
import { PipelineFunnel } from './PipelineFunnel'
import { PipelineStageTab } from './PipelineStageTab'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'

const CATEGORIES = getCategoriesForContext('knowledge_base').map(c => c.value)

interface FunnelStage {
  stage: string
  label: string
  count: number
  percentage: number
}

interface FunnelData {
  funnel: {
    stages: FunnelStage[]
    total: number
    pendingValidation: number
    rejected: number
    needsRevision: number
  }
  bottlenecks: Array<{
    stage: string
    label: string
    count: number
    avgDaysInStage: number
  }>
  avgTimePerStage?: Array<{
    stage: string
    avgHours: number
    count: number
  }>
  throughput?: {
    dailyAdvanced: Array<{ date: string; count: number }>
    rejectionsBySource: Array<{ source_name: string; rejected: number; total: number; rate: number }>
    slaBreaches: number
  }
}

interface DocumentSummary {
  id: string
  title: string
  category: string
  language: string
  pipeline_stage: string
  quality_score: number | null
  is_indexed: boolean
  source_file: string | null
  days_in_stage: number
  created_at: string
  web_source_id: string | null
  source_name: string | null
}

interface PipelineSource {
  id: string
  name: string
  base_url: string
  category: string
}

interface DocsResult {
  documents: DocumentSummary[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const STAGES = [
  { value: 'crawled', label: 'Crawlé' },
  { value: 'content_reviewed', label: 'Contenu validé' },
  { value: 'classified', label: 'Classifié' },
  { value: 'indexed', label: 'Indexé' },
  { value: 'quality_analyzed', label: 'Qualité' },
  { value: 'rag_active', label: 'RAG Actif' },
  { value: 'rejected', label: 'Rejeté' },
  { value: 'needs_revision', label: 'À réviser' },
] as const

export function PipelineDashboard() {
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null)
  const [activeTab, setActiveTab] = useState('crawled')
  const [docs, setDocs] = useState<DocsResult | null>(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [category, setCategory] = useState('')
  const [language, setLanguage] = useState('')
  const [sources, setSources] = useState<PipelineSource[]>([])
  const [isLoadingFunnel, setIsLoadingFunnel] = useState(true)
  const [isLoadingDocs, setIsLoadingDocs] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  // Fetch funnel stats
  const fetchFunnel = useCallback(async () => {
    setIsLoadingFunnel(true)
    try {
      const res = await fetch('/api/admin/pipeline/stats')
      if (res.ok) {
        const data = await res.json()
        setFunnelData(data)
        setLastRefresh(new Date())
      }
    } catch (error) {
      console.error('Erreur fetch funnel:', error)
    } finally {
      setIsLoadingFunnel(false)
    }
  }, [])

  // Fetch sources list
  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pipeline/sources')
      if (res.ok) {
        const data = await res.json()
        setSources(data.sources || [])
      }
    } catch (error) {
      console.error('Erreur fetch sources:', error)
    }
  }, [])

  // Fetch documents for active tab
  const fetchDocs = useCallback(async () => {
    setIsLoadingDocs(true)
    try {
      const params = new URLSearchParams({
        stage: activeTab,
        page: page.toString(),
        limit: '20',
      })
      if (search) params.set('search', search)
      if (sourceId) params.set('sourceId', sourceId)
      if (category) params.set('category', category)
      if (language) params.set('language', language)

      const res = await fetch(`/api/admin/pipeline/documents?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDocs(data)
      }
    } catch (error) {
      console.error('Erreur fetch docs:', error)
    } finally {
      setIsLoadingDocs(false)
    }
  }, [activeTab, page, search, sourceId, category, language])

  useEffect(() => {
    fetchFunnel()
    fetchSources()
    const interval = setInterval(fetchFunnel, 30000)
    return () => clearInterval(interval)
  }, [fetchFunnel, fetchSources])

  useEffect(() => {
    fetchDocs()
  }, [fetchDocs])

  // Reset page when changing tab or filters
  useEffect(() => {
    setPage(1)
  }, [activeTab, search, sourceId, category, language])

  const handleStageClick = (stage: string) => {
    setActiveTab(stage)
    setPage(1)
  }

  const handleBulkAdvance = async (ids: string[], notes?: string) => {
    const res = await fetch('/api/admin/pipeline/bulk/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docIds: ids, notes }),
    })
    if (res.ok) {
      await fetchDocs()
      await fetchFunnel()
    }
  }

  const handleBulkReject = async (ids: string[], reason: string) => {
    const res = await fetch('/api/admin/pipeline/bulk/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docIds: ids, reason }),
    })
    if (res.ok) {
      await fetchDocs()
      await fetchFunnel()
    }
  }

  const handleBulkReclassify = async (ids: string[], newCategory: string) => {
    const res = await fetch('/api/admin/pipeline/bulk/reclassify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docIds: ids, category: newCategory }),
    })
    if (res.ok) {
      await fetchDocs()
      await fetchFunnel()
    }
  }

  // Debounce search
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  return (
    <div className="space-y-6">
      {/* Header avec bouton refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline KB</h1>
          <p className="text-muted-foreground">
            Validation supervisée des documents de la base de connaissances
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Mis à jour à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchFunnel(); fetchDocs() }}
            disabled={isLoadingFunnel}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingFunnel ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {funnelData ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Documents</CardDescription>
              <CardTitle className="text-3xl">{funnelData.funnel.total.toLocaleString()}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>RAG Actif</CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {funnelData.funnel.stages.find(s => s.stage === 'rag_active')?.count.toLocaleString() ?? '0'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>En Validation</CardDescription>
              <CardTitle className="text-3xl text-amber-600">
                {funnelData.funnel.pendingValidation.toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>À réviser / Rejetés</CardDescription>
              <CardTitle className="text-3xl text-red-600">
                {(funnelData.funnel.needsRevision + funnelData.funnel.rejected).toLocaleString()}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : isLoadingFunnel ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border bg-card p-6 animate-pulse">
              <div className="h-3 w-24 bg-muted rounded mb-3" />
              <div className="h-8 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : null}

      {/* Funnel avec skeleton */}
      {isLoadingFunnel ? (
        <div className="rounded-lg border bg-card p-6 space-y-3 animate-pulse">
          <div className="h-4 w-32 bg-muted rounded" />
          <div className="h-8 w-full bg-muted rounded" />
          <div className="h-8 w-4/5 bg-muted rounded" />
          <div className="h-8 w-3/5 bg-muted rounded" />
        </div>
      ) : funnelData ? (
        <PipelineFunnel
          stages={funnelData.funnel.stages}
          total={funnelData.funnel.total}
          pendingValidation={funnelData.funnel.pendingValidation}
          rejected={funnelData.funnel.rejected}
          needsRevision={funnelData.funnel.needsRevision}
          onStageClick={handleStageClick}
        />
      ) : null}

      {/* Stats enrichies */}
      {funnelData?.throughput && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Throughput 7j */}
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Throughput 7j</p>
            <div className="space-y-1">
              {funnelData.throughput.dailyAdvanced.length > 0 ? (
                funnelData.throughput.dailyAdvanced.slice(0, 7).map(d => (
                  <div key={d.date} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' })}</span>
                    <span className="font-medium">{d.count} docs</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucune activité</p>
              )}
            </div>
          </div>

          {/* SLA Breaches */}
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">SLA ({'>'}3j sans avancer)</p>
            <p className={`text-3xl font-bold ${funnelData.throughput.slaBreaches > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {funnelData.throughput.slaBreaches}
            </p>
            <p className="text-xs text-muted-foreground mt-1">documents en attente</p>
          </div>

          {/* Taux rejet par source */}
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm font-medium text-muted-foreground mb-2">Taux rejet par source</p>
            <div className="space-y-1">
              {funnelData.throughput.rejectionsBySource.length > 0 ? (
                funnelData.throughput.rejectionsBySource.slice(0, 5).map(s => (
                  <div key={s.source_name} className="flex justify-between text-sm">
                    <span className="truncate max-w-[140px] text-muted-foreground">{s.source_name}</span>
                    <span className={`font-medium ${s.rate > 20 ? 'text-red-600' : s.rate > 10 ? 'text-amber-600' : 'text-green-600'}`}>
                      {s.rate}%
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Aucune donnée</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Temps moyen par transition */}
      {funnelData?.avgTimePerStage && funnelData.avgTimePerStage.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm font-medium text-muted-foreground mb-3">Temps moyen par transition</p>
          <div className="flex flex-wrap gap-3">
            {funnelData.avgTimePerStage.map(t => (
              <div key={t.stage} className="rounded-md bg-muted/50 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{t.stage}</span>
                <span className="ml-2 font-medium">
                  {t.avgHours < 1 ? `${Math.round(t.avgHours * 60)}min` : t.avgHours < 24 ? `${t.avgHours}h` : `${Math.round(t.avgHours / 24)}j`}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">({t.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs par étape */}
      <Tabs value={activeTab} onValueChange={handleStageClick}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {STAGES.map(s => {
            const count = funnelData?.funnel.stages.find(fs => fs.stage === s.value)?.count
              ?? (s.value === 'rejected' ? funnelData?.funnel.rejected : undefined)
              ?? (s.value === 'needs_revision' ? funnelData?.funnel.needsRevision : undefined)
              ?? 0
            return (
              <TabsTrigger key={s.value} value={s.value} className="gap-1.5">
                {s.label}
                {count > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            )
          })}
          <TabsTrigger value="bottlenecks" className="gap-1.5">
            Bottlenecks
            {funnelData?.bottlenecks && funnelData.bottlenecks.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {funnelData.bottlenecks.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bottlenecks">
          <Card>
            <CardHeader>
              <CardTitle>Bottlenecks Détectés</CardTitle>
              <CardDescription>
                Étapes avec le plus de documents en attente
              </CardDescription>
            </CardHeader>
            <CardContent>
              {funnelData?.bottlenecks && funnelData.bottlenecks.length > 0 ? (
                <div className="space-y-3">
                  {funnelData.bottlenecks.map(bottleneck => (
                    <div
                      key={bottleneck.stage}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{bottleneck.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {bottleneck.count} documents • Moyenne {bottleneck.avgDaysInStage.toFixed(1)} jours
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  Aucun bottleneck détecté
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {STAGES.map(s => (
          <TabsContent key={s.value} value={s.value}>
            <PipelineStageTab
              stage={s.value}
              stageLabel={s.label}
              documents={docs?.documents || []}
              total={docs?.total || 0}
              page={page}
              totalPages={docs?.totalPages || 1}
              isLoading={isLoadingDocs}
              onPageChange={setPage}
              onRefresh={() => { fetchDocs(); fetchFunnel() }}
              onBulkAdvance={handleBulkAdvance}
              onBulkReject={handleBulkReject}
              onBulkReclassify={handleBulkReclassify}
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              sourceId={sourceId}
              onSourceChange={setSourceId}
              category={category}
              onCategoryChange={setCategory}
              language={language}
              onLanguageChange={setLanguage}
              sources={sources}
              categories={CATEGORIES}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
