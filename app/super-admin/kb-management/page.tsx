/**
 * Page Super Admin - Gestion KB Unifiée
 * Fusion de KB Quality + KB Quality Review
 */

'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Activity, CheckCircle, RefreshCw } from 'lucide-react'

// Composants unifiés
import { HealthDashboard } from '@/components/super-admin/kb-management/HealthDashboard'
import { ValidationQueue } from '@/components/super-admin/kb-management/ValidationQueue'
import { ReAnalysis } from '@/components/super-admin/kb-management/ReAnalysis'

export default function KBManagementPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = searchParams.get('tab') || 'health'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Gestion Base de Connaissances</h1>
        <p className="text-muted-foreground mt-2">
          Maintenance, validation et analyse qualité des documents KB
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="health" className="gap-2">
            <Activity className="w-4 h-4" />
            Health Dashboard
          </TabsTrigger>
          <TabsTrigger value="validation" className="gap-2">
            <CheckCircle className="w-4 h-4" />
            Validation Queue
          </TabsTrigger>
          <TabsTrigger value="reanalysis" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Ré-analyse
          </TabsTrigger>
        </TabsList>

        {/* Health Dashboard - Stats + Dry Run */}
        <TabsContent value="health" className="mt-6">
          <HealthDashboard />
        </TabsContent>

        {/* Validation Queue - Validation manuelle + Leaderboard */}
        <TabsContent value="validation" className="mt-6">
          <ValidationQueue />
        </TabsContent>

        {/* Re-Analysis - Batch operations */}
        <TabsContent value="reanalysis" className="mt-6">
          <ReAnalysis />
        </TabsContent>
      </Tabs>
    </div>
  )
}
