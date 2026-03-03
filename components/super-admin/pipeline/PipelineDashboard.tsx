'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { RefreshCw } from 'lucide-react'
import { PipelineFunnel } from './PipelineFunnel'
import { PipelineStageTab } from './PipelineStageTab'
import { PipelineStatsCards, PipelineStatsCardsSkeleton } from './PipelineStatsCards'
import { PipelineThroughputStats } from './PipelineThroughputStats'
import { getCategoriesForContext } from '@/lib/categories/legal-categories'
import { PageHeader } from '@/components/super-admin/shared/PageHeader'

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

  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Pipeline KB"
        description="Validation supervisée des documents de la base de connaissances"
        action={
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
        }
      />

      {/* Stats cards */}
      {isLoadingFunnel && !funnelData ? (
        <PipelineStatsCardsSkeleton />
      ) : funnelData ? (
        <PipelineStatsCards funnel={funnelData.funnel} />
      ) : null}

      {/* Funnel */}
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

      {/* Throughput + avg time */}
      {funnelData?.throughput && (
        <PipelineThroughputStats
          throughput={funnelData.throughput}
          avgTimePerStage={funnelData.avgTimePerStage}
        />
      )}

      {/* Tabs par étape */}
      <Tabs value={activeTab} onValueChange={handleStageClick}>
        <TabsList className="w-full overflow-x-auto flex h-auto gap-1 pb-0.5 justify-start">
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
