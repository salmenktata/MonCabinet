/**
 * Page Super Admin - Détail d'une source web
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db, query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icons } from '@/lib/icons'
import { Card, CardContent } from '@/components/ui/card'
import { WebSourceActions } from '@/components/super-admin/web-sources/WebSourceActions'
import { WebSourceHealthSummary } from '@/components/super-admin/web-sources/WebSourceHealthSummary'
import { WebSourceActivityTabs } from '@/components/super-admin/web-sources/WebSourceActivityTabs'
import { CollapsibleSection } from '@/components/super-admin/web-sources/CollapsibleSection'
import { CategoryBadge } from '@/components/super-admin/web-sources/CategoryBadge'
import { WebSourceTreeView } from '@/components/super-admin/web-sources/WebSourceTreeView'
import { safeParseInt } from '@/lib/utils/safe-number'

interface CodeStats {
  code_name: string
  code_slug: string
  total_pages: number
  pending: number
  crawled: number
  unchanged: number
  failed: number
  indexed: number
  last_crawl_at: string | null
}

interface CategoryGroup {
  legal_domain: string | null
  total_pages: number
  codes: CodeStats[]
}

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getWebSourceData(id: string) {
  // Source - avec conversion de l'interval en texte
  const sourceResult = await db.query(
    `SELECT
      id, name, base_url, description, favicon_url,
      category, language, priority,
      crawl_frequency::text as crawl_frequency,
      adaptive_frequency, css_selectors, url_patterns, excluded_patterns,
      max_depth, max_pages, follow_links, download_files,
      requires_javascript, user_agent, rate_limit_ms, timeout_ms,
      respect_robots_txt, custom_headers, sitemap_url, rss_feed_url, use_sitemap,
      ignore_ssl_errors, auto_index_files,
      is_active, rag_enabled, health_status, consecutive_failures,
      last_crawl_at, last_successful_crawl_at, next_crawl_at,
      total_pages_discovered, total_pages_indexed,
      avg_pages_per_crawl, avg_crawl_duration_ms,
      created_by, created_at, updated_at
    FROM web_sources WHERE id = $1`,
    [id]
  )

  if (sourceResult.rows.length === 0) {
    return null
  }

  // Sérialiser les dates et objets pour les composants client
  const rawSource = sourceResult.rows[0]
  const source = {
    ...rawSource,
    css_selectors: rawSource.css_selectors || {},
    url_patterns: rawSource.url_patterns || [],
    excluded_patterns: rawSource.excluded_patterns || [],
    custom_headers: rawSource.custom_headers || {},
    last_crawl_at: rawSource.last_crawl_at?.toISOString() || null,
    last_successful_crawl_at: rawSource.last_successful_crawl_at?.toISOString() || null,
    next_crawl_at: rawSource.next_crawl_at?.toISOString() || null,
    created_at: rawSource.created_at?.toISOString() || null,
    updated_at: rawSource.updated_at?.toISOString() || null,
  }

  // Stats des pages
  const statsResult = await db.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
      COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COALESCE(SUM(word_count), 0) as total_words,
      COALESCE(SUM(chunks_count), 0) as total_chunks
    FROM web_pages
    WHERE web_source_id = $1`,
    [id]
  )

  // Stats métadonnées structurées
  const metadataStatsResult = await db.query(
    `SELECT
      COUNT(DISTINCT wpsm.web_page_id) as pages_with_metadata
    FROM web_pages wp
    LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
    WHERE wp.web_source_id = $1`,
    [id]
  )

  // Dernières pages
  const pagesResult = await db.query(
    `SELECT id, url, title, status, is_indexed, word_count, chunks_count, last_crawled_at
     FROM web_pages
     WHERE web_source_id = $1
     ORDER BY last_crawled_at DESC NULLS LAST
     LIMIT 10`,
    [id]
  )

  // Stats par catégorie juridique
  const categoryStatsResult = await db.query(
    `SELECT
      legal_domain,
      COUNT(*) as count,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed_count
     FROM web_pages
     WHERE web_source_id = $1
     GROUP BY legal_domain
     ORDER BY count DESC`,
    [id]
  )

  // Stats groupées par catégorie juridique et code
  // Dérive legal_domain et code_slug depuis l'URL quand les métadonnées sont NULL
  // GROUP BY uniquement sur legal_domain + code_slug (pas code_name qui est unique par article)
  const treeStatsResult = await db.query(
    `SELECT
      COALESCE(legal_domain,
        CASE
          WHEN url ~ '/kb/codes/' THEN 'codes'
          ELSE 'autre'
        END
      ) as legal_domain,
      COALESCE(site_structure->>'code_slug',
        CASE
          WHEN url ~ '/kb/codes/([^/]+)' THEN
            substring(url from '/kb/codes/([^/]+)')
          ELSE 'autre'
        END
      ) as code_slug,
      MIN(COALESCE(site_structure->>'code_name_ar', site_structure->>'code_name_fr', title)) as code_name,
      COUNT(*) as total_pages,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
      COUNT(*) FILTER (WHERE status = 'unchanged') as unchanged,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
      MAX(last_crawled_at) as last_crawl_at
     FROM web_pages
     WHERE web_source_id = $1
     GROUP BY 1, 2
     ORDER BY 1, total_pages DESC`,
    [id]
  )

  // Derniers logs
  const logsResult = await db.query(
    `SELECT *
     FROM web_crawl_logs
     WHERE web_source_id = $1
     ORDER BY started_at DESC
     LIMIT 5`,
    [id]
  )

  // Sérialiser les pages
  const pages = pagesResult.rows.map(p => ({
    ...p,
    last_crawled_at: p.last_crawled_at?.toISOString() || null,
  }))

  // Sérialiser les logs
  const logs = logsResult.rows.map(l => ({
    ...l,
    started_at: l.started_at?.toISOString() || null,
    completed_at: l.completed_at?.toISOString() || null,
  }))

  // Grouper les stats par catégorie juridique
  const treeGroups = treeStatsResult.rows.reduce((acc, row) => {
    const domain = row.legal_domain || 'null'
    if (!acc[domain]) {
      acc[domain] = {
        legal_domain: row.legal_domain,
        total_pages: 0,
        codes: [],
      }
    }
    acc[domain].total_pages += parseInt(row.total_pages, 10)
    acc[domain].codes.push({
      code_name: row.code_name,
      code_slug: row.code_slug,
      total_pages: parseInt(row.total_pages, 10),
      pending: parseInt(row.pending, 10),
      crawled: parseInt(row.crawled, 10),
      unchanged: parseInt(row.unchanged, 10),
      failed: parseInt(row.failed, 10),
      indexed: parseInt(row.indexed, 10),
      last_crawl_at: row.last_crawl_at?.toISOString() || null,
    })
    return acc
  }, {} as Record<string, CategoryGroup>)

  const treeData = Object.values(treeGroups) as CategoryGroup[]

  return {
    source,
    stats: {
      ...statsResult.rows[0],
      pages_with_metadata: metadataStatsResult.rows[0]?.pages_with_metadata || 0,
    },
    categoryStats: categoryStatsResult.rows,
    treeData,
    pages,
    logs,
  }
}

export default async function WebSourceDetailPage({ params }: PageProps) {
  const { id } = await params

  // Récupérer le rôle utilisateur
  const session = await getSession()
  let userRole = 'user'
  if (session?.user?.id) {
    const userResult = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
    userRole = userResult.rows[0]?.role || 'user'
  }
  const isSuperAdmin = userRole === 'super_admin'

  const data = await getWebSourceData(id)

  if (!data) {
    notFound()
  }

  const { source, stats, categoryStats, treeData, pages, logs } = data

  const healthColors: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    failing: 'bg-red-500',
    unknown: 'bg-slate-500',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Link href="/super-admin/web-sources">
            <Button variant="ghost" size="sm" className="text-slate-400">
              <Icons.arrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${healthColors[source.health_status]}`} />
              <h1 className="text-2xl font-bold text-white">{source.name}</h1>
              <CategoryBadge category={source.category} />
              {!source.is_active && (
                <Badge variant="outline" className="border-slate-600 text-slate-400">
                  Inactive
                </Badge>
              )}
            </div>
            <a
              href={source.base_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-blue-400 text-sm flex items-center gap-1 mt-1"
            >
              <Icons.externalLink className="h-3 w-3" />
              {source.base_url}
            </a>
          </div>
        </div>

        <WebSourceActions source={source} readOnly={!isSuperAdmin} />
      </div>

      {/* Stats KPI - Position #2 (priorité) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Pages crawlées"
          value={parseInt(stats.total, 10)}
          icon={<Icons.fileText className="h-4 w-4" />}
        />
        <StatCard
          label="Pages indexées"
          value={parseInt(stats.indexed, 10)}
          icon={<Icons.checkCircle className="h-4 w-4" />}
          color="green"
        />
        <StatCard
          label="Pages organisées"
          value={parseInt(stats.pages_with_metadata, 10)}
          icon={<Icons.sparkles className="h-4 w-4" />}
          color="orange"
          subtitle={`${((parseInt(stats.pages_with_metadata, 10) / parseInt(stats.total, 10)) * 100).toFixed(1)}%`}
        />
        <StatCard
          label="Chunks RAG"
          value={parseInt(stats.total_chunks, 10)}
          icon={<Icons.box className="h-4 w-4" />}
          color="purple"
        />
        <StatCard
          label="En erreur"
          value={parseInt(stats.failed, 10)}
          icon={<Icons.alertTriangle className="h-4 w-4" />}
          color={parseInt(stats.failed, 10) > 0 ? 'red' : 'slate'}
        />
      </div>

      {/* Résumé Santé */}
      <WebSourceHealthSummary
        lastCrawlAt={source.last_crawl_at}
        nextCrawlAt={source.next_crawl_at}
        totalPages={parseInt(stats.total, 10)}
        failedPages={parseInt(stats.failed, 10)}
        healthStatus={source.health_status}
      />

      {/* Arbre hiérarchique - Collapsible */}
      {treeData && treeData.length > 0 && (
        <CollapsibleSection
          title="Pages par catégorie et code"
          subtitle={`${treeData.reduce((sum: number, g: any) => sum + g.total_pages, 0)} pages`}
          defaultOpen={true}
        >
          <WebSourceTreeView groups={treeData} sourceId={id} />
        </CollapsibleSection>
      )}

      {/* Activité récente - Tabs unifié */}
      <WebSourceActivityTabs pages={pages} logs={logs} sourceId={id} />

      {/* Configuration technique - Collapsible (caché par défaut) */}
      <CollapsibleSection title="Configuration technique" subtitle="10 paramètres" defaultOpen={false}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Fréquence</span>
            <p className="text-white">{source.crawl_frequency}</p>
          </div>
          <div>
            <span className="text-slate-400">Profondeur max</span>
            <p className="text-white">{source.max_depth} niveaux</p>
          </div>
          <div>
            <span className="text-slate-400">Limite pages</span>
            <p className="text-white">{source.max_pages}</p>
          </div>
          <div>
            <span className="text-slate-400">Rate limit</span>
            <p className="text-white">{source.rate_limit_ms}ms</p>
          </div>
          <div>
            <span className="text-slate-400">JavaScript</span>
            <p className="text-white">{source.requires_javascript ? 'Oui' : 'Non'}</p>
          </div>
          <div>
            <span className="text-slate-400">Téléchargement fichiers</span>
            <p className="text-white">{source.download_files ? 'Oui' : 'Non'}</p>
          </div>
          <div>
            <span className="text-slate-400">SSL strict</span>
            <p className="text-white">{source.ignore_ssl_errors ? 'Désactivé' : 'Oui'}</p>
          </div>
          <div>
            <span className="text-slate-400">Auto-indexation PDF</span>
            <p className="text-white">{source.auto_index_files ? 'Oui' : 'Non'}</p>
          </div>
          <div>
            <span className="text-slate-400">Dernier crawl</span>
            <p className="text-white">
              {source.last_crawl_at
                ? new Date(source.last_crawl_at).toLocaleString('fr-FR')
                : 'Jamais'}
            </p>
          </div>
          <div>
            <span className="text-slate-400">Prochain crawl</span>
            <p className="text-white">
              {source.next_crawl_at
                ? new Date(source.next_crawl_at).toLocaleString('fr-FR')
                : '-'}
            </p>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  icon: React.ReactNode
  color?: 'blue' | 'green' | 'purple' | 'red' | 'slate' | 'orange'
  subtitle?: string
}

function StatCard({ label, value, icon, color = 'blue', subtitle }: StatCardProps) {
  const colors = {
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    red: 'text-red-400',
    slate: 'text-slate-400',
    orange: 'text-orange-400',
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-4">
      <div className={`flex items-center gap-2 ${colors[color]}`}>
        {icon}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold text-white">{value}</p>
        {subtitle && <span className="text-sm text-slate-500">{subtitle}</span>}
      </div>
    </div>
  )
}
