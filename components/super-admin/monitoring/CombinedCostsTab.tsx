'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PieChart, DollarSign } from 'lucide-react'
import { ProviderUsageTab } from './ProviderUsageTab'
import { AICostsTab } from './AICostsTab'

export function CombinedCostsTab() {
  return (
    <Tabs defaultValue="providers" className="space-y-4">
      <TabsList>
        <TabsTrigger value="providers" className="flex items-center gap-2">
          <PieChart className="h-4 w-4" />
          Providers
        </TabsTrigger>
        <TabsTrigger value="costs" className="flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Coûts IA
        </TabsTrigger>
      </TabsList>
      <TabsContent value="providers">
        <ProviderUsageTab />
      </TabsContent>
      <TabsContent value="costs">
        <AICostsTab />
      </TabsContent>
    </Tabs>
  )
}
