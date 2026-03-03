'use client'

/**
 * Client Component pour Dashboard Monitoring
 * Séparé de page.tsx pour permettre le Suspense boundary
 */

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, DollarSign, Gauge, Server, Radar, Settings2 } from 'lucide-react'
import { ProductionMonitoringTab } from '@/components/super-admin/monitoring/ProductionMonitoringTab'
import { InfrastructureTab } from '@/components/super-admin/monitoring/InfrastructureTab'
import { RAGKBTab } from '@/components/super-admin/monitoring/RAGKBTab'
import { CombinedCostsTab } from '@/components/super-admin/monitoring/CombinedCostsTab'
import { OperationsTab } from '@/components/super-admin/monitoring/OperationsTab'
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
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="infrastructure" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span className="hidden sm:inline">Infrastructure</span>
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="rag-kb" className="flex items-center gap-2">
            <Radar className="h-4 w-4" />
            <span className="hidden sm:inline">RAG & KB</span>
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Coûts IA</span>
          </TabsTrigger>
          <TabsTrigger value="operations" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Opérations</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="infrastructure" className="space-y-6">
          <InfrastructureTab />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <ProductionMonitoringTab />
        </TabsContent>

        <TabsContent value="rag-kb" className="space-y-6">
          <RAGKBTab />
        </TabsContent>

        <TabsContent value="costs" className="space-y-6">
          <CombinedCostsTab />
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <OperationsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
