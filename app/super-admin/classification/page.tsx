import { Metadata } from 'next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ReviewQueue } from '@/components/super-admin/classification/ReviewQueue'
import { CorrectionsHistory } from '@/components/super-admin/classification/CorrectionsHistory'
import { GeneratedRules } from '@/components/super-admin/classification/GeneratedRules'
import { ClassificationAnalytics } from '@/components/super-admin/classification/ClassificationAnalytics'

export const metadata: Metadata = {
  title: 'Classification Juridique - Qadhya',
  description: 'Gestion et révision des classifications automatiques',
}

export default function ClassificationPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Classification Juridique</h1>
          <p className="text-muted-foreground mt-2">
            Revue et correction des classifications automatiques de documents juridiques
          </p>
        </div>
      </div>

      <Tabs defaultValue="queue" className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="queue">À Revoir</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="rules">Règles Auto</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          <ReviewQueue />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <CorrectionsHistory />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <GeneratedRules />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <ClassificationAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  )
}
