'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'
import { WebSourcePages } from './WebSourcePages'
import { WebSourceLogs } from './WebSourceLogs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

interface WebSourceActivityTabsProps {
  pages: any[]
  logs: any[]
  sourceId: string
}

export function WebSourceActivityTabs({ pages, logs, sourceId }: WebSourceActivityTabsProps) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white text-lg">Activité récente</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="pages" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="pages" className="flex items-center gap-2">
              <Icons.fileText className="h-4 w-4" />
              Dernières pages
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Icons.history className="h-4 w-4" />
              Historique crawls
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="space-y-3">
            <div className="flex justify-end">
              <Link href={`/super-admin/web-sources/${sourceId}/pages`}>
                <Button variant="ghost" size="sm" className="text-slate-400">
                  Voir tout
                  <Icons.chevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
            <WebSourcePages pages={pages} sourceId={sourceId} />
          </TabsContent>

          <TabsContent value="logs">
            <WebSourceLogs logs={logs} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
