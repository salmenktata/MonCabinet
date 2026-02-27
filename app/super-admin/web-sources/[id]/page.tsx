/**
 * Page Super Admin - Détail d'une source web
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db, query } from '@/lib/db/postgres'
import { getSession } from '@/lib/auth/session'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Icons } from '@/lib/icons'
import { WebSourceActions } from '@/components/super-admin/web-sources/WebSourceActions'
import { WebSourceActivityTabs } from '@/components/super-admin/web-sources/WebSourceActivityTabs'
import { CollapsibleSection } from '@/components/super-admin/web-sources/CollapsibleSection'
import { CategoryBadge } from '@/components/super-admin/web-sources/CategoryBadge'
import { WebSourceTreeView } from '@/components/super-admin/web-sources/WebSourceTreeView'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'

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

  if (sourceResult.rows.length === 0) return null

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

  const [statsResult, metadataStatsResult, pagesResult, categoryStatsResult, treeStatsResult, logsResult] =
    await Promise.all([
      db.query(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'indexed') as indexed,
          COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COALESCE(SUM(word_count), 0) as total_words,
          COALESCE(SUM(chunks_count), 0) as total_chunks
        FROM web_pages WHERE web_source_id = $1`,
        [id]
      ),
      db.query(
        `SELECT COUNT(DISTINCT wpsm.web_page_id) as pages_with_metadata
        FROM web_pages wp
        LEFT JOIN web_page_structured_metadata wpsm ON wp.id = wpsm.web_page_id
        WHERE wp.web_source_id = $1`,
        [id]
      ),
      db.query(
        `SELECT id, url, title, status, is_indexed, word_count, chunks_count, last_crawled_at
        FROM web_pages WHERE web_source_id = $1
        ORDER BY last_crawled_at DESC NULLS LAST LIMIT 10`,
        [id]
      ),
      db.query(
        `SELECT legal_domain, COUNT(*) as count, COUNT(*) FILTER (WHERE is_indexed = true) as indexed_count
        FROM web_pages WHERE web_source_id = $1
        GROUP BY legal_domain ORDER BY count DESC`,
        [id]
      ),
      db.query(
        `SELECT
          COALESCE(legal_domain,
            CASE WHEN url ~ '/kb/codes/' THEN 'codes' ELSE 'autre' END
          ) as legal_domain,
          COALESCE(site_structure->>'code_slug',
            CASE WHEN url ~ '/kb/codes/([^/]+)' THEN substring(url from '/kb/codes/([^/]+)') ELSE 'autre' END
          ) as code_slug,
          MIN(COALESCE(site_structure->>'code_name_ar', site_structure->>'code_name_fr', title)) as code_name,
          COUNT(*) as total_pages,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'crawled') as crawled,
          COUNT(*) FILTER (WHERE status = 'unchanged') as unchanged,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE is_indexed = true) as indexed,
          MAX(last_crawled_at) as last_crawl_at
        FROM web_pages WHERE web_source_id = $1
        GROUP BY 1, 2 ORDER BY 1, total_pages DESC`,
        [id]
      ),
      db.query(
        `SELECT * FROM web_crawl_logs WHERE web_source_id = $1
        ORDER BY started_at DESC LIMIT 5`,
        [id]
      ),
    ])

  const pages = pagesResult.rows.map(p => ({
    ...p,
    last_crawled_at: p.last_crawled_at?.toISOString() || null,
  }))

  const logs = logsResult.rows.map(l => ({
    ...l,
    started_at: l.started_at?.toISOString() || null,
    completed_at: l.completed_at?.toISOString() || null,
  }))

  const treeGroups = treeStatsResult.rows.reduce((acc, row) => {
    const domain = row.legal_domain || 'null'
    if (!acc[domain]) {
      acc[domain] = { legal_domain: row.legal_domain, total_pages: 0, codes: [] }
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

  return {
    source,
    stats: {
      ...statsResult.rows[0],
      pages_with_metadata: metadataStatsResult.rows[0]?.pages_with_metadata || 0,
    },
    categoryStats: categoryStatsResult.rows,
    treeData: Object.values(treeGroups) as CategoryGroup[],
    pages,
    logs,
  }
}

export default async function WebSourceDetailPage({ params }: PageProps) {
  const { id } = await params

  const session = await getSession()
  let userRole = 'user'
  if (session?.user?.id) {
    const userResult = await query('SELECT role FROM users WHERE id = $1', [session.user.id])
    userRole = userResult.rows[0]?.role || 'user'
  }

  const data = await getWebSourceData(id)
  if (!data) notFound()

  const { source, stats, treeData, pages, logs } = data

  const total = parseInt(stats.total, 10)
  const failed = parseInt(stats.failed, 10)
  const indexed = parseInt(stats.indexed, 10)
  const withMetadata = parseInt(stats.pages_with_metadata, 10)
  const chunks = parseInt(stats.total_chunks, 10)
  const successRate = total > 0 ? ((total - failed) / total) * 100 : 0

  const healthDotColor: Record<string, string> = {
    healthy: 'bg-green-500',
    degraded: 'bg-yellow-500',
    failing: 'bg-red-500',
    unknown: 'bg-slate-500',
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Link href="/super-admin/web-sources">
            <Button variant="ghost" size="sm" className="text-slate-400 shrink-0">
              <Icons.arrowLeft className="h-4 w-4 mr-2" />
              Retour
            </Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDotColor[source.health_status]}`} />
              <h1 className="text-xl font-bold text-white">{source.name}</h1>
              <CategoryBadge category={source.category} />
              {!source.is_active && (
                <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">
                  Inactive
                </Badge>
              )}
              {!source.rag_enabled && (
                <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                  RAG off
                </Badge>
              )}
            </div>
            <a
              href={source.base_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-blue-400 text-sm flex items-center gap-1 mt-0.5"
            >
              <Icons.externalLink className="h-3 w-3" />
              {source.base_url}
            </a>
          </div>
        </div>
        <WebSourceActions source={source} readOnly={userRole !== 'super_admin'} />
      </div>

      {/* ── Strip KPI + Santé (8 colonnes) ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCell label="Pages" value={total} icon={<Icons.fileText className="h-3.5 w-3.5" />} />
        <StatCell
          label="Indexées"
          value={indexed}
          icon={<Icons.checkCircle className="h-3.5 w-3.5" />}
          color="green"
        />
        <StatCell
          label="Organisées"
          value={withMetadata}
          icon={<Icons.sparkles className="h-3.5 w-3.5" />}
          color="orange"
          subtitle={total > 0 ? `${((withMetadata / total) * 100).toFixed(0)}%` : undefined}
        />
        <StatCell
          label="Chunks RAG"
          value={chunks}
          icon={<Icons.box className="h-3.5 w-3.5" />}
          color="purple"
        />
        <StatCell
          label="Erreurs"
          value={failed}
          icon={<Icons.alertTriangle className="h-3.5 w-3.5" />}
          color={failed > 0 ? 'red' : 'slate'}
        />
        <StatCell
          label="Dernier crawl"
          icon={<Icons.clock className="h-3.5 w-3.5" />}
          text={
            source.last_crawl_at
              ? formatDistanceToNow(new Date(source.last_crawl_at), { addSuffix: true, locale: fr })
              : 'Jamais'
          }
        />
        <StatCell
          label="Prochain crawl"
          icon={<Icons.calendar className="h-3.5 w-3.5" />}
          text={
            source.next_crawl_at
              ? formatDistanceToNow(new Date(source.next_crawl_at), { addSuffix: true, locale: fr })
              : 'Non planifié'
          }
        />
        <StatCell
          label="Taux succès"
          icon={<Icons.target className="h-3.5 w-3.5" />}
          text={`${successRate.toFixed(0)}%`}
          color={successRate >= 90 ? 'green' : successRate >= 70 ? 'orange' : 'red'}
        />
      </div>

      {/* ── Contenu principal : 2 colonnes ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Colonne gauche : TreeView */}
        <div className="lg:col-span-3">
          {treeData.length > 0 ? (
            <CollapsibleSection
              title="Pages par catégorie et code"
              subtitle={`${treeData.reduce((s, g) => s + g.total_pages, 0)} pages`}
              defaultOpen={true}
            >
              <WebSourceTreeView groups={treeData} sourceId={id} />
            </CollapsibleSection>
          ) : (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="py-12 text-center text-slate-400">
                <Icons.fileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Aucune page crawlée</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Colonne droite : Activité + Config */}
        <div className="lg:col-span-2 space-y-4">
          {/* Activité récente */}
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-base">Activité récente</CardTitle>
            </CardHeader>
            <CardContent>
              <WebSourceActivityTabs pages={pages} logs={logs} sourceId={id} />
            </CardContent>
          </Card>

          {/* Configuration technique */}
          <CollapsibleSection title="Configuration" subtitle="technique" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <ConfigItem label="Fréquence" value={source.crawl_frequency} />
              <ConfigItem label="Profondeur max" value={`${source.max_depth} niveaux`} />
              <ConfigItem label="Limite pages" value={String(source.max_pages)} />
              <ConfigItem label="Rate limit" value={`${source.rate_limit_ms}ms`} />
              <ConfigItem label="JavaScript" value={source.requires_javascript ? 'Oui' : 'Non'} />
              <ConfigItem label="Fichiers PDF" value={source.download_files ? 'Oui' : 'Non'} />
              <ConfigItem label="SSL strict" value={source.ignore_ssl_errors ? 'Désactivé' : 'Oui'} />
              <ConfigItem label="Auto-index PDF" value={source.auto_index_files ? 'Oui' : 'Non'} />
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  )
}

// ── Composants locaux ──────────────────────────────────────────────────────────

interface StatCellProps {
  label: string
  value?: number
  text?: string
  icon: React.ReactNode
  color?: 'blue' | 'green' | 'purple' | 'red' | 'slate' | 'orange'
  subtitle?: string
}

const colorMap = {
  blue: 'text-blue-400',
  green: 'text-green-400',
  purple: 'text-purple-400',
  red: 'text-red-400',
  slate: 'text-slate-400',
  orange: 'text-orange-400',
}

function StatCell({ label, value, text, icon, color = 'blue', subtitle }: StatCellProps) {
  const colorClass = colorMap[color]
  return (
    <div className="bg-slate-800/50 rounded-lg p-3">
      <div className={`flex items-center gap-1.5 mb-1 ${colorClass}`}>
        {icon}
        <span className="text-xs text-slate-400 truncate">{label}</span>
      </div>
      {value !== undefined ? (
        <div className="flex items-baseline gap-1.5">
          <p className="text-xl font-bold text-white">{value.toLocaleString()}</p>
          {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
        </div>
      ) : (
        <p className={`text-sm font-medium ${colorClass} truncate`}>{text}</p>
      )}
    </div>
  )
}

function ConfigItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400 text-xs">{label}</span>
      <p className="text-white text-sm">{value}</p>
    </div>
  )
}
