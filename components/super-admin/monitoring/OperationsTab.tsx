'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Clock, Eye } from 'lucide-react'
import { CronsAndBatchesTab } from './CronsAndBatchesTab'
import { ImpersonationsTab } from './ImpersonationsTab'

export function OperationsTab() {
  return (
    <Tabs defaultValue="crons" className="space-y-4">
      <TabsList>
        <TabsTrigger value="crons" className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Crons & Batches
        </TabsTrigger>
        <TabsTrigger value="impersonations" className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Impersonations
        </TabsTrigger>
      </TabsList>
      <TabsContent value="crons">
        <CronsAndBatchesTab />
      </TabsContent>
      <TabsContent value="impersonations">
        <ImpersonationsTab />
      </TabsContent>
    </Tabs>
  )
}
