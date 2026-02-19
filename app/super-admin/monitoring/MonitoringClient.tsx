'use client'

/**
 * Client Component pour Dashboard Monitoring
 * Séparé de page.tsx pour permettre le Suspense boundary
 */

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, PieChart, DollarSign, Gauge, Heart, Database, Clock, Settings, Eye, FileType, Radar } from 'lucide-react'
import { ProductionMonitoringTab } from '@/components/super-admin/monitoring/ProductionMonitoringTab'
import { ProviderUsageTab } from '@/components/super-admin/monitoring/ProviderUsageTab'
import { AICostsTab } from '@/components/super-admin/monitoring/AICostsTab'
import { APIHealthTab } from '@/components/super-admin/monitoring/APIHealthTab'
import { KBQualityTab } from '@/components/super-admin/monitoring/KBQualityTab'
import { CronsAndBatchesTab } from '@/components/super-admin/monitoring/CronsAndBatchesTab'
import { ImpersonationsTab } from '@/components/super-admin/monitoring/ImpersonationsTab'
import SystemConfigTab from '@/components/super-admin/monitoring/SystemConfigTab'
import { DocTypeStatsPanel } from '@/components/super-admin/monitoring/DocTypeStatsPanel'
import { RAGHealthTab } from '@/components/super-admin/monitoring/RAGHealthTab'
import { DriftDetectionTab } from '@/components/super-admin/monitoring/DriftDetectionTab'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function MonitoringClient() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = searchParams.get('tab') || 'overview'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Production</h1>
          <p className="text-muted-foreground">
            Surveillance infrastructure, clés API, coûts et performance en temps réel
          </p>
        </div>

        {/* Quick link to Quotas (separate page) */}
        <Link href="/super-admin/quotas">
          <Button variant="outline">
            <Gauge className="h-4 w-4 mr-2" />
            Quotas & Alertes
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <div className="overflow-x-auto">
        <TabsList className="grid w-max min-w-full grid-cols-10">
          <TabsTrigger value="system-config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="kb-quality" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">KB Quality</span>
          </TabsTrigger>
          <TabsTrigger value="rag-health" className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            <span className="hidden sm:inline">RAG Health</span>
          </TabsTrigger>
          <TabsTrigger value="doc-types" className="flex items-center gap-2">
            <FileType className="h-4 w-4" />
            <span className="hidden sm:inline">Types Docs</span>
          </TabsTrigger>
          <TabsTrigger value="providers" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            <span className="hidden sm:inline">Providers</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Coûts IA</span>
          </TabsTrigger>
          <TabsTrigger value="api-health" className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="hidden sm:inline">API Health</span>
          </TabsTrigger>
          <TabsTrigger value="crons" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Crons & Batches</span>
          </TabsTrigger>
          <TabsTrigger value="drift" className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            <span className="hidden sm:inline">Drift</span>
          </TabsTrigger>
          <TabsTrigger value="impersonations" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">Impersonations</span>
          </TabsTrigger>
        </TabsList>
        </div>

        {/* Tab 0: System Configuration */}
        <TabsContent value="system-config" className="space-y-6">
          <SystemConfigTab />
        </TabsContent>

        {/* Tab 1: Production Overview */}
        <TabsContent value="overview" className="space-y-6">
          <ProductionMonitoringTab />
        </TabsContent>

        {/* Tab 2: KB Quality - Analyse Base de Connaissances */}
        <TabsContent value="kb-quality" className="space-y-6">
          <KBQualityTab />
        </TabsContent>

        {/* Tab 3: RAG Health - Santé système RAG */}
        <TabsContent value="rag-health" className="space-y-6">
          <RAGHealthTab />
        </TabsContent>

        {/* Tab 4: Doc Types - Statistiques par type de document */}
        <TabsContent value="doc-types" className="space-y-6">
          <DocTypeStatsPanel />
        </TabsContent>

        {/* Tab 4: Provider Usage */}
        <TabsContent value="providers" className="space-y-6">
          <ProviderUsageTab />
        </TabsContent>

        {/* Tab 5: AI Costs */}
        <TabsContent value="costs" className="space-y-6">
          <AICostsTab />
        </TabsContent>

        {/* Tab 6: API Health */}
        <TabsContent value="api-health" className="space-y-6">
          <APIHealthTab />
        </TabsContent>

        {/* Tab 7: Crons & Batches */}
        <TabsContent value="crons" className="space-y-6">
          <CronsAndBatchesTab />
        </TabsContent>

        {/* Tab 8: Drift Detection */}
        <TabsContent value="drift" className="space-y-6">
          <DriftDetectionTab />
        </TabsContent>

        {/* Tab 9: Impersonations */}
        <TabsContent value="impersonations" className="space-y-6">
          <ImpersonationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
