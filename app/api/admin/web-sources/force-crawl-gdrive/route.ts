/**
 * API Route TEMPORAIRE: Forcer le crawl Google Drive
 * Protégé par CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { crawlGoogleDriveFolder } from '@/lib/web-scraper/gdrive-crawler-service'
import { db } from '@/lib/db/postgres'

export const dynamic = 'force-dynamic'
export const maxDuration = 600 // 10 minutes

const GDRIVE_SOURCE_ID = '546d11c8-b3fd-4559-977b-c3572aede0e4'

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Vérifier CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const incrementalMode = body.incremental ?? false

    console.log(`[ForceCrawlGDrive] Démarrage crawl (incremental: ${incrementalMode})...`)

    // Récupérer la source
    const sourceResult = await db.query(
      'SELECT * FROM web_sources WHERE id = $1',
      [GDRIVE_SOURCE_ID]
    )

    if (sourceResult.rows.length === 0) {
      return NextResponse.json(
        { error: `Source ${GDRIVE_SOURCE_ID} non trouvée` },
        { status: 404 }
      )
    }

    const row = sourceResult.rows[0]
    const source = {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      category: row.category,
      downloadFiles: row.download_files,
      followLinks: row.follow_links,
      driveConfig: row.drive_config,
      // Propriétés additionnelles requises par WebSource
      description: row.description,
      faviconUrl: row.favicon_url,
      language: row.language,
      priority: row.priority,
      scheduleCron: row.schedule_cron,
      maxDepth: row.max_depth,
      respectRobotsTxt: row.respect_robots_txt,
      userAgent: row.user_agent,
      timeout: row.timeout_ms,
      retryAttempts: row.retry_attempts,
      crawlDelay: row.crawl_delay_ms,
      requiresJavascript: row.requires_javascript,
      cookieConsent: row.cookie_consent,
      loginRequired: row.login_required,
      loginCredentials: row.login_credentials,
      formCrawlConfig: row.form_crawl_config,
      ignoreSSLErrors: row.ignore_ssl_errors,
      seedUrls: row.seed_urls,
      urlPatterns: row.url_patterns,
      excludedPatterns: row.excluded_patterns,
      useSitemap: row.use_sitemap,
      sitemapUrl: row.sitemap_url,
      customHeaders: row.custom_headers,
      proxyConfig: row.proxy_config,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastCrawledAt: row.last_crawled_at,
      nextCrawlAt: row.next_crawl_at,
      lastError: row.last_error,
      totalPages: row.total_pages,
      activePagesCount: row.active_pages_count,
      errorPagesCount: row.error_pages_count,
      averageCrawlTimeMs: row.average_crawl_time_ms,
      successRate: row.success_rate,
      tags: row.tags,
      maxPages: row.max_pages,        // CRITIQUE: sans ça, limite par défaut à 1000 fichiers
      lastCrawlAt: row.last_crawl_at, // Fix mode incrémental (lastCrawledAt ≠ lastCrawlAt)
    } as any // Cast pour éviter les problèmes de types snake_case vs camelCase

    // Lancer le crawl
    const result = await crawlGoogleDriveFolder(source, { incrementalMode })

    console.log(
      `[ForceCrawlGDrive] Terminé: ${result.pagesProcessed} pages, ` +
        `${result.pagesNew} new, ${result.pagesChanged} changed, ` +
        `${result.errors.length} errors`
    )

    // Statistiques contenu
    const statsResult = await db.query(
      `SELECT
        COUNT(*) FILTER (WHERE LENGTH(extracted_text) > 100) as with_content,
        COUNT(*) FILTER (WHERE LENGTH(extracted_text) <= 100 OR extracted_text IS NULL) as without_content,
        COUNT(*) as total
      FROM web_pages
      WHERE web_source_id = $1 AND status IN ('crawled', 'unchanged')`,
      [GDRIVE_SOURCE_ID]
    )

    const stats = statsResult.rows[0]

    return NextResponse.json({
      success: true,
      message: `Crawl terminé: ${result.pagesProcessed} pages traitées`,
      crawl: {
        processed: result.pagesProcessed,
        new: result.pagesNew,
        changed: result.pagesChanged,
        failed: result.pagesFailed,
        filesDownloaded: result.filesDownloaded,
        errors: result.errors.length,
      },
      content: {
        withContent: parseInt(stats.with_content),
        withoutContent: parseInt(stats.without_content),
        total: parseInt(stats.total),
      },
      errorDetails: result.errors.slice(0, 10), // Limiter à 10 premières erreurs
    })
  } catch (error) {
    console.error('[ForceCrawlGDrive] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur crawl',
      },
      { status: 500 }
    )
  }
}
