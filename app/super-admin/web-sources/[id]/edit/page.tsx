/**
 * Page Super Admin - Modifier une source web
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db/postgres'
import { Button } from '@/components/ui/button'
import { Icons } from '@/lib/icons'
import { EditWebSourceWizard } from '@/components/super-admin/web-sources/EditWebSourceWizard'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

async function getWebSource(id: string) {
  const result = await db.query(
    `SELECT
      id, name, base_url, description,
      category, language, priority,
      crawl_frequency::text as crawl_frequency,
      max_depth, max_pages,
      requires_javascript, download_files,
      use_sitemap, sitemap_url,
      respect_robots_txt, rate_limit_ms,
      css_selectors, url_patterns, excluded_patterns,
      is_active
    FROM web_sources WHERE id = $1`,
    [id]
  )

  if (result.rows.length === 0) {
    return null
  }

  const source = result.rows[0]

  return {
    id: source.id,
    name: source.name,
    baseUrl: source.base_url,
    description: source.description || '',
    category: source.category,
    language: source.language,
    crawlFrequency: source.crawl_frequency,
    maxDepth: source.max_depth,
    maxPages: source.max_pages,
    requiresJavascript: source.requires_javascript,
    downloadFiles: source.download_files,
    useSitemap: source.use_sitemap,
    sitemapUrl: source.sitemap_url || '',
    respectRobotsTxt: source.respect_robots_txt,
    rateLimitMs: source.rate_limit_ms,
    contentSelector: source.css_selectors?.content?.join(', ') || '',
    excludeSelectors: source.css_selectors?.exclude?.join(', ') || '',
    urlPatterns: source.url_patterns?.join('\n') || '',
    excludedPatterns: source.excluded_patterns?.join('\n') || '',
    isActive: source.is_active,
  }
}

export default async function EditWebSourcePage({ params }: PageProps) {
  const { id } = await params
  const source = await getWebSource(id)

  if (!source) {
    notFound()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/super-admin/web-sources/${id}`}>
          <Button variant="ghost" size="sm" className="text-slate-400">
            <Icons.arrowLeft className="h-4 w-4 mr-2" />
            Retour
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Modifier {source.name}</h1>
          <p className="text-slate-400 mt-1">
            Modifiez la configuration de la source
          </p>
        </div>
      </div>

      {/* Wizard en mode édition */}
      <EditWebSourceWizard initialData={source} sourceId={id} />
    </div>
  )
}
