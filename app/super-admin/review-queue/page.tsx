/**
 * Page Super Admin - File de Revue Unifiée
 * Fusion de Classification + Content Review
 */

'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileCheck, History, Sparkles, BarChart3, FileText } from 'lucide-react'

// Components from classification
import { CorrectionsHistory } from '@/components/super-admin/classification/CorrectionsHistory'
import { GeneratedRules } from '@/components/super-admin/classification/GeneratedRules'
import { ClassificationAnalytics } from '@/components/super-admin/classification/ClassificationAnalytics'

// New unified components
import { ClassificationQueue } from '@/components/super-admin/review-queue/ClassificationQueue'
import { ContentReviewQueue } from '@/components/super-admin/review-queue/ContentReviewQueue'

export default function ReviewQueuePage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = searchParams.get('tab') || 'content'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">File de Revue</h1>
        <p className="text-muted-foreground mt-2">
          Validation du contenu juridique et classification avec revue humaine
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="content" className="gap-2">
            <FileText className="w-4 h-4" />
            Contenu Juridique
          </TabsTrigger>
          <TabsTrigger value="classification" className="gap-2">
            <FileCheck className="w-4 h-4" />
            Classification
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

        {/* Contenu Juridique - Ancien content-review */}
        <TabsContent value="content" className="mt-6">
          <ContentReviewQueue />
        </TabsContent>

        {/* Classification - Ancien classification */}
        <TabsContent value="classification" className="mt-6">
          <ClassificationQueue />
        </TabsContent>

        {/* Historique */}
        <TabsContent value="history" className="mt-6">
          <CorrectionsHistory />
        </TabsContent>

        {/* Règles Auto */}
        <TabsContent value="rules" className="mt-6">
          <GeneratedRules />
        </TabsContent>

        {/* Analytics */}
        <TabsContent value="analytics" className="mt-6">
          <ClassificationAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  )
}
