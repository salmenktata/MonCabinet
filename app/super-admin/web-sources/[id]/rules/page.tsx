/**
 * Page Super Admin - Règles de classification pour une source web
 * Gestion des règles de mapping automatique
 */

import { Suspense } from 'react'
import nextDynamic from 'next/dynamic'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { RulesStats } from '@/components/super-admin/web-sources/RulesStats'

// Lazy load du gestionnaire de règles (833 lignes) pour alléger le bundle
const RulesManager = nextDynamic(
  () => import('@/components/super-admin/web-sources/RulesManager').then(mod => ({ default: mod.RulesManager })),
  {
    loading: () => <div className="h-64 bg-slate-800 animate-pulse rounded-lg" />
  }
)

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getRulesData(webSourceId: string) {
  // Récupérer la source
  const sourceResult = await db.query(
    'SELECT id, name, base_url, category FROM web_sources WHERE id = $1',
    [webSourceId]
  )

  if (sourceResult.rows.length === 0) {
    return null
  }

  const source = sourceResult.rows[0]

  // Récupérer les règles de cette source
  const rulesResult = await db.query(
    `SELECT * FROM source_classification_rules
     WHERE web_source_id = $1
     ORDER BY priority DESC, created_at`,
    [webSourceId]
  )

  // Récupérer les règles globales
  const globalRulesResult = await db.query(
    `SELECT * FROM source_classification_rules
     WHERE web_source_id IS NULL AND is_active = true
     ORDER BY priority DESC, created_at`
  )

  // Récupérer la taxonomie pour les selects
  const taxonomyResult = await db.query(`
    SELECT code, label_fr, type FROM legal_taxonomy
    WHERE is_active = true
    ORDER BY type, sort_order, label_fr
  `)

  // Statistiques des règles
  const statsResult = await db.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      SUM(times_matched) as total_matches,
      SUM(times_correct) as total_correct
    FROM source_classification_rules
    WHERE web_source_id = $1
  `, [webSourceId])

  const rules = rulesResult.rows.map(row => ({
    id: row.id,
    webSourceId: row.web_source_id,
    name: row.name,
    description: row.description,
    conditions: row.conditions || [],
    targetCategory: row.target_category,
    targetDomain: row.target_domain,
    targetDocumentType: row.target_document_type,
    priority: row.priority,
    confidenceBoost: parseFloat(row.confidence_boost),
    isActive: row.is_active,
    timesMatched: row.times_matched,
    timesCorrect: row.times_correct,
    lastMatchedAt: row.last_matched_at?.toISOString(),
    createdAt: row.created_at?.toISOString(),
  }))

  const globalRules = globalRulesResult.rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    conditions: row.conditions || [],
    targetCategory: row.target_category,
    targetDomain: row.target_domain,
    targetDocumentType: row.target_document_type,
    priority: row.priority,
    isActive: row.is_active,
    timesMatched: row.times_matched,
  }))

  const taxonomy = {
    categories: taxonomyResult.rows.filter(t => t.type === 'category').map(t => ({ code: t.code, label: t.label_fr })),
    domains: taxonomyResult.rows.filter(t => t.type === 'domain').map(t => ({ code: t.code, label: t.label_fr })),
    documentTypes: taxonomyResult.rows.filter(t => t.type === 'document_type').map(t => ({ code: t.code, label: t.label_fr })),
  }

  const stats = statsResult.rows[0]

  return {
    source: {
      id: source.id,
      name: source.name,
      baseUrl: source.base_url,
      category: source.category,
    },
    rules,
    globalRules,
    taxonomy,
    stats: {
      total: parseInt(stats.total, 10),
      active: parseInt(stats.active, 10),
      totalMatches: parseInt(stats.total_matches || '0', 10),
      accuracy: stats.total_matches > 0 ? parseInt(stats.total_correct || '0', 10) / parseInt(stats.total_matches, 10) : 0,
    },
  }
}

export default async function RulesPage({ params }: PageProps) {
  const { id } = await params
  const data = await getRulesData(id)

  if (!data) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
            <Link href="/super-admin/web-sources" className="hover:text-white">
              Sources Web
            </Link>
            <Icons.chevronRight className="h-4 w-4" />
            <Link href={`/super-admin/web-sources/${data.source.id}`} className="hover:text-white">
              {data.source.name}
            </Link>
            <Icons.chevronRight className="h-4 w-4" />
            <span className="text-white">Règles</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Règles de classification</h1>
          <p className="text-slate-400 mt-1">
            Configurez les règles de mapping automatique pour {data.source.name}
          </p>
        </div>
        <Link href={`/super-admin/web-sources/${data.source.id}`}>
          <Button variant="outline">
            <Icons.arrowLeft className="h-4 w-4 mr-2" />
            Retour à la source
          </Button>
        </Link>
      </div>

      {/* Statistiques */}
      <Suspense fallback={<div className="h-24 bg-slate-800 animate-pulse rounded-lg" />}>
        <RulesStats stats={data.stats} />
      </Suspense>

      {/* Gestionnaire de règles */}
      <Suspense fallback={<div className="h-64 bg-slate-800 animate-pulse rounded-lg" />}>
        <RulesManager
          sourceId={data.source.id}
          sourceName={data.source.name}
          sourceBaseUrl={data.source.baseUrl}
          rules={data.rules}
          globalRules={data.globalRules}
          taxonomy={data.taxonomy}
        />
      </Suspense>
    </div>
  )
}
