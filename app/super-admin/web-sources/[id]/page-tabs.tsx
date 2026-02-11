/**
 * Page Super Admin - Détail source web avec tabs
 * Version unifiée avec Aperçu, Pages, Fichiers, Règles
 */

'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, Download, Filter, LayoutGrid } from 'lucide-react'

interface WebSourceTabsProps {
  sourceId: string
  overviewContent: React.ReactNode
  pagesContent: React.ReactNode
  filesContent: React.ReactNode
  rulesContent: React.ReactNode
}

export function WebSourceTabs({
  sourceId,
  overviewContent,
  pagesContent,
  filesContent,
  rulesContent,
}: WebSourceTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const activeTab = searchParams.get('tab') || 'overview'

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`?${params.toString()}`)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
      <TabsList className="grid w-full grid-cols-4 bg-slate-800 border-slate-700">
        <TabsTrigger value="overview" className="gap-2">
          <LayoutGrid className="h-4 w-4" />
          Aperçu
        </TabsTrigger>
        <TabsTrigger value="pages" className="gap-2">
          <FileText className="h-4 w-4" />
          Pages
        </TabsTrigger>
        <TabsTrigger value="files" className="gap-2">
          <Download className="h-4 w-4" />
          Fichiers
        </TabsTrigger>
        <TabsTrigger value="rules" className="gap-2">
          <Filter className="h-4 w-4" />
          Règles
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        {overviewContent}
      </TabsContent>

      <TabsContent value="pages" className="mt-6">
        {pagesContent}
      </TabsContent>

      <TabsContent value="files" className="mt-6">
        {filesContent}
      </TabsContent>

      <TabsContent value="rules" className="mt-6">
        {rulesContent}
      </TabsContent>
    </Tabs>
  )
}
