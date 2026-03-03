'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Radar, TrendingDown } from 'lucide-react'
import { KBQualityTab } from './KBQualityTab'
import { RAGHealthTab } from './RAGHealthTab'
import { DriftDetectionTab } from './DriftDetectionTab'

export function RAGKBTab() {
  return (
    <Tabs defaultValue="kb-quality" className="space-y-4">
      <TabsList>
        <TabsTrigger value="kb-quality" className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Qualité KB
        </TabsTrigger>
        <TabsTrigger value="rag-health" className="flex items-center gap-2">
          <Radar className="h-4 w-4" />
          Santé RAG
        </TabsTrigger>
        <TabsTrigger value="drift" className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Drift
        </TabsTrigger>
      </TabsList>
      <TabsContent value="kb-quality">
        <KBQualityTab />
      </TabsContent>
      <TabsContent value="rag-health">
        <RAGHealthTab />
      </TabsContent>
      <TabsContent value="drift">
        <DriftDetectionTab />
      </TabsContent>
    </Tabs>
  )
}
