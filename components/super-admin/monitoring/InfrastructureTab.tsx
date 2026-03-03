'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Heart } from 'lucide-react'
import SystemConfigTab from './SystemConfigTab'
import { APIHealthTab } from './APIHealthTab'

export function InfrastructureTab() {
  return (
    <Tabs defaultValue="config" className="space-y-4">
      <TabsList>
        <TabsTrigger value="config" className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Config Système
        </TabsTrigger>
        <TabsTrigger value="api-health" className="flex items-center gap-2">
          <Heart className="h-4 w-4" />
          Santé API
        </TabsTrigger>
      </TabsList>
      <TabsContent value="config">
        <SystemConfigTab />
      </TabsContent>
      <TabsContent value="api-health">
        <APIHealthTab />
      </TabsContent>
    </Tabs>
  )
}
