'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LayoutDashboard,
  Users,
  LogIn,
  Coins,
  MessageSquareX,
  ThumbsUp,
  Clock,
} from 'lucide-react'
import { OverviewTab } from '@/components/super-admin/analytics/OverviewTab'
import { UsersTableTab } from '@/components/super-admin/analytics/UsersTableTab'
import { ConnectionsTab } from '@/components/super-admin/analytics/ConnectionsTab'
import { TokensTab } from '@/components/super-admin/analytics/TokensTab'
import { RagUsageTab } from '@/components/super-admin/analytics/RagUsageTab'
import { FeedbackTab } from '@/components/super-admin/analytics/FeedbackTab'
import { PeakHoursTab } from '@/components/super-admin/analytics/PeakHoursTab'

const TABS = [
  { value: 'overview', label: 'Vue d\'ensemble', Icon: LayoutDashboard },
  { value: 'users', label: 'Utilisateurs', Icon: Users },
  { value: 'connections', label: 'Connexions', Icon: LogIn },
  { value: 'tokens', label: 'Tokens & Coûts', Icon: Coins },
  { value: 'rag', label: 'Usage RAG', Icon: MessageSquareX },
  { value: 'feedback', label: 'Feedback', Icon: ThumbsUp },
  { value: 'peak', label: 'Horaires Peak', Icon: Clock },
]

export function AnalyticsClient() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = searchParams.get('tab') || 'overview'

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Analytics Clients</h1>
        <p className="text-muted-foreground">
          Comportement des avocats — connexions, usage RAG, tokens, satisfaction et horaires peak
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {TABS.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="users"><UsersTableTab /></TabsContent>
        <TabsContent value="connections"><ConnectionsTab /></TabsContent>
        <TabsContent value="tokens"><TokensTab /></TabsContent>
        <TabsContent value="rag"><RagUsageTab /></TabsContent>
        <TabsContent value="feedback"><FeedbackTab /></TabsContent>
        <TabsContent value="peak"><PeakHoursTab /></TabsContent>
      </Tabs>
    </div>
  )
}
