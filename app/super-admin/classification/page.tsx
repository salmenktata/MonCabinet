'use client'

/**
 * Page: Classification Review & Corrections
 *
 * Interface principale pour la gestion des classifications juridiques :
 * - Tab 1 : À Revoir (queue pages nécessitant validation)
 * - Tab 2 : Historique Corrections
 * - Tab 3 : Règles Auto-générées
 * - Tab 4 : Analytics
 */

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle, BarChart3, Sparkles } from 'lucide-react'
import { ReviewQueue } from '@/components/super-admin/classification/ReviewQueue'
import { CorrectionsHistory } from '@/components/super-admin/classification/CorrectionsHistory'
import { GeneratedRules } from '@/components/super-admin/classification/GeneratedRules'
import { ClassificationAnalytics } from '@/components/super-admin/classification/ClassificationAnalytics'

export default function ClassificationPage() {
  const [activeTab, setActiveTab] = useState<string>('queue')

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Classification Juridique</h1>
        <p className="text-muted-foreground mt-2">
          Revue et correction des classifications automatiques de documents juridiques
        </p>
      </div>

      {/* Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="queue" className="space-x-2">
            <AlertCircle className="h-4 w-4" />
            <span>À Revoir</span>
          </TabsTrigger>

          <TabsTrigger value="history" className="space-x-2">
            <CheckCircle className="h-4 w-4" />
            <span>Historique</span>
          </TabsTrigger>

          <TabsTrigger value="rules" className="space-x-2">
            <Sparkles className="h-4 w-4" />
            <span>Règles Auto</span>
          </TabsTrigger>

          <TabsTrigger value="analytics" className="space-x-2">
            <BarChart3 className="h-4 w-4" />
            <span>Analytics</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: À Revoir - Queue de pages nécessitant validation */}
        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pages à Revoir</CardTitle>
              <CardDescription>
                Pages nécessitant une validation humaine, triées par priorité (urgent → high → medium → low)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewQueue />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Historique - Corrections effectuées */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historique des Corrections</CardTitle>
              <CardDescription>
                Corrections de classification effectuées avec leur impact (règles générées automatiquement)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CorrectionsHistory />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Règles - Règles auto-générées */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Règles Auto-générées</CardTitle>
              <CardDescription>
                Règles de classification générées automatiquement à partir des corrections humaines
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GeneratedRules />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Analytics - Statistiques et métriques */}
        <TabsContent value="analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Analytics Classification</CardTitle>
              <CardDescription>
                Statistiques et métriques de performance du système de classification
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClassificationAnalytics />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
