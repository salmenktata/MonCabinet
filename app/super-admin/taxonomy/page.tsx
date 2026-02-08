/**
 * Page Super Admin - Taxonomie Juridique
 * Gestion de la taxonomie centralisée pour la classification des documents
 */

import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { db } from '@/lib/db/postgres'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Icons } from '@/lib/icons'

// Dynamic imports pour réduire le bundle initial
const TaxonomyManager = nextDynamic(
  () => import('@/components/super-admin/taxonomy/TaxonomyManager').then(m => ({ default: m.TaxonomyManager })),
  { loading: () => <div className="h-96 bg-slate-800 animate-pulse rounded-lg" /> }
)

const TaxonomySuggestions = nextDynamic(
  () => import('@/components/super-admin/taxonomy/TaxonomySuggestions').then(m => ({ default: m.TaxonomySuggestions })),
  { loading: () => <div className="h-64 bg-slate-800 animate-pulse rounded-lg" /> }
)

const TaxonomyStats = nextDynamic(
  () => import('@/components/super-admin/taxonomy/TaxonomyStats').then(m => ({ default: m.TaxonomyStats })),
  { loading: () => <div className="h-32 bg-slate-800 animate-pulse rounded-lg" /> }
)

export const dynamic = 'force-dynamic'

async function getTaxonomyData() {
  // Récupérer toute la taxonomie
  const taxonomyResult = await db.query(`
    SELECT * FROM legal_taxonomy
    WHERE is_active = true
    ORDER BY type, sort_order, label_fr
  `)

  // Statistiques
  const statsResult = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE type = 'category') as categories,
      COUNT(*) FILTER (WHERE type = 'domain') as domains,
      COUNT(*) FILTER (WHERE type = 'document_type') as document_types,
      COUNT(*) FILTER (WHERE type = 'tribunal') as tribunals,
      COUNT(*) FILTER (WHERE type = 'chamber') as chambers,
      COUNT(*) FILTER (WHERE suggested_by_ai = true) as ai_suggested,
      COUNT(*) FILTER (WHERE is_system = true) as system_items
    FROM legal_taxonomy
    WHERE is_active = true
  `)

  // Suggestions en attente
  const suggestionsResult = await db.query(`
    SELECT * FROM taxonomy_suggestions
    WHERE status = 'pending'
    ORDER BY occurrence_count DESC, created_at DESC
    LIMIT 20
  `)

  // Grouper la taxonomie par type
  const taxonomy = taxonomyResult.rows.map(row => ({
    id: row.id,
    type: row.type,
    code: row.code,
    parentCode: row.parent_code,
    labelFr: row.label_fr,
    labelAr: row.label_ar,
    description: row.description,
    icon: row.icon,
    color: row.color,
    isActive: row.is_active,
    isSystem: row.is_system,
    sortOrder: row.sort_order,
    suggestedByAi: row.suggested_by_ai,
  }))

  const grouped = {
    category: taxonomy.filter(t => t.type === 'category'),
    domain: taxonomy.filter(t => t.type === 'domain'),
    document_type: taxonomy.filter(t => t.type === 'document_type'),
    tribunal: taxonomy.filter(t => t.type === 'tribunal'),
    chamber: taxonomy.filter(t => t.type === 'chamber'),
  }

  const stats = statsResult.rows[0]

  const suggestions = suggestionsResult.rows.map(row => ({
    id: row.id,
    type: row.type,
    suggestedCode: row.suggested_code,
    suggestedLabelFr: row.suggested_label_fr,
    suggestedLabelAr: row.suggested_label_ar,
    reason: row.reason,
    occurrenceCount: row.occurrence_count,
    sampleUrls: row.sample_urls || [],
    createdAt: row.created_at?.toISOString(),
  }))

  return {
    taxonomy: grouped,
    stats: {
      total: parseInt(stats.total, 10),
      categories: parseInt(stats.categories, 10),
      domains: parseInt(stats.domains, 10),
      documentTypes: parseInt(stats.document_types, 10),
      tribunals: parseInt(stats.tribunals, 10),
      chambers: parseInt(stats.chambers, 10),
      aiSuggested: parseInt(stats.ai_suggested, 10),
      systemItems: parseInt(stats.system_items, 10),
    },
    suggestions,
  }
}

export default async function TaxonomyPage() {
  const data = await getTaxonomyData()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Taxonomie Juridique</h1>
        <p className="text-slate-400 mt-1">
          Gérez la classification des documents juridiques tunisiens
        </p>
      </div>

      {/* Statistiques */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <TaxonomyStats stats={data.stats} />
      </Suspense>

      {/* Onglets */}
      <Tabs defaultValue="taxonomy" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="taxonomy" className="data-[state=active]:bg-slate-700">
            <Icons.folder className="h-4 w-4 mr-2" />
            Taxonomie
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="data-[state=active]:bg-slate-700">
            <Icons.lightbulb className="h-4 w-4 mr-2" />
            Suggestions IA
            {data.suggestions.length > 0 && (
              <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs">
                {data.suggestions.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="taxonomy" className="space-y-4">
          <TaxonomyManager taxonomy={data.taxonomy} />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          {data.suggestions.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Icons.check className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-slate-400 text-center">
                  Aucune suggestion en attente
                </p>
              </CardContent>
            </Card>
          ) : (
            <TaxonomySuggestions suggestions={data.suggestions} taxonomy={data.taxonomy} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
