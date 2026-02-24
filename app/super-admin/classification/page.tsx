'use client'

import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReviewQueue } from '@/components/super-admin/classification/ReviewQueue'
import { CorrectionsHistory } from '@/components/super-admin/classification/CorrectionsHistory'
import { GeneratedRules } from '@/components/super-admin/classification/GeneratedRules'
import { ClassificationAnalytics } from '@/components/super-admin/classification/ClassificationAnalytics'
import { ClassifyBatchButton } from '@/components/super-admin/classification/ClassifyBatchButton'
import { FileCheck, History, Sparkles, BarChart3, Zap } from 'lucide-react'

export default function ClassificationPage() {
  const [urgentCount, setUrgentCount] = useState(0)

  useEffect(() => {
    fetch('/api/super-admin/classification/queue?limit=1')
      .then((r) => r.json())
      .then((data) => setUrgentCount(data?.stats?.urgent || 0))
      .catch(() => {})
  }, [])

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classification Juridique</h1>
        <p className="text-muted-foreground mt-2">
          Système de classification automatique avec revue humaine et apprentissage continu
        </p>
      </div>

      <Tabs defaultValue="batch" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="batch" className="gap-2">
            <Zap className="w-4 h-4" />
            Batch
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <FileCheck className="w-4 h-4" />
            À Revoir
            {urgentCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs font-semibold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center leading-none">
                {urgentCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            Historique
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2">
            <Sparkles className="w-4 h-4" />
            Règles Auto
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="batch" className="mt-6">
          <ClassifyBatchButton />
        </TabsContent>

        <TabsContent value="queue" className="mt-6">
          <ReviewQueue />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <CorrectionsHistory />
        </TabsContent>

        <TabsContent value="rules" className="mt-6">
          <GeneratedRules />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <ClassificationAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  )
}
