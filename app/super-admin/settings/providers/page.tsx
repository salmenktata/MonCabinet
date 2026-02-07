'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'
import { EmailProvidersConfig } from '@/components/super-admin/settings/EmailProvidersConfig'
import { AIProvidersConfig } from '@/components/super-admin/settings/AIProvidersConfig'

export default function ProvidersPage() {
  const [activeTab, setActiveTab] = useState('email')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Providers</h2>
        <p className="text-slate-400">
          Configuration des providers de communication et d&apos;IA
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger
            value="email"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
          >
            <Icons.mail className="h-4 w-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger
            value="ai"
            className="data-[state=active]:bg-slate-700 data-[state=active]:text-white"
          >
            <Icons.zap className="h-4 w-4 mr-2" />
            IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="space-y-6">
          <EmailProvidersConfig />
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <AIProvidersConfig />
        </TabsContent>
      </Tabs>
    </div>
  )
}
