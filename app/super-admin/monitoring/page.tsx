'use client'

/**
 * Dashboard Monitoring Unifié - Consolidation 6 pages
 *
 * 6 onglets :
 * 1. Overview : Métriques production temps réel
 * 2. KB Quality : Analyse qualité base de connaissances + budget OpenAI
 * 3. Providers : Matrice provider × opération
 * 4. Costs : Analyse coûts IA
 * 5. API Health : Health check clés API (ancien /api-keys-health)
 * 6. Crons & Batches : Monitoring exécution crons et batches
 */

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, PieChart, DollarSign, Gauge, Heart, Database, Clock } from 'lucide-react'
import { ProductionMonitoringTab } from '@/components/super-admin/monitoring/ProductionMonitoringTab'
import { ProviderUsageTab } from '@/components/super-admin/monitoring/ProviderUsageTab'
import { AICostsTab } from '@/components/super-admin/monitoring/AICostsTab'
import { APIHealthTab } from '@/components/super-admin/monitoring/APIHealthTab'
import { KBQualityTab } from '@/components/super-admin/monitoring/KBQualityTab'
import { CronsAndBatchesTab } from '@/components/super-admin/monitoring/CronsAndBatchesTab'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function MonitoringPage() {
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
        <TabsList className="grid w-full grid-cols-6 lg:w-[1200px]">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="kb-quality" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">KB Quality</span>
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
        </TabsList>

        {/* Tab 1: Production Overview */}
        <TabsContent value="overview" className="space-y-6">
          <ProductionMonitoringTab />
        </TabsContent>

        {/* Tab 2: KB Quality - Analyse Base de Connaissances */}
        <TabsContent value="kb-quality" className="space-y-6">
          <KBQualityTab />
        </TabsContent>

        {/* Tab 3: Provider Usage */}
        <TabsContent value="providers" className="space-y-6">
          <ProviderUsageTab />
        </TabsContent>

        {/* Tab 4: AI Costs */}
        <TabsContent value="costs" className="space-y-6">
          <AICostsTab />
        </TabsContent>

        {/* Tab 5: API Health */}
        <TabsContent value="api-health" className="space-y-6">
          <APIHealthTab />
        </TabsContent>

        {/* Tab 6: Crons & Batches */}
        <TabsContent value="crons" className="space-y-6">
          <CronsAndBatchesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
