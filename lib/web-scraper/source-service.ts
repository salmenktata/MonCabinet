/**
 * Service de gestion des sources web
 * CRUD et opérations sur les sources
 */

import { db } from '@/lib/db/postgres'
import type {
  WebSource,
  WebPage,
  WebCrawlJob,
  WebCrawlLog,
  WebSourceStats,
  CreateWebSourceInput,
  UpdateWebSourceInput,
  CssSelectors,
  HealthStatus,
} from './types'

/** Convert pg interval (object or string) to a plain string */
function stringifyInterval(val: unknown): string {
  if (typeof val === 'string') return val
  if (val && typeof val === 'object') {
    const iv = val as Record<string, number>
    if (iv.days) return `${iv.days} days`
    if (iv.hours) return iv.hours >= 24 ? `${Math.floor(iv.hours / 24)} days` : `${iv.hours} hours`
    if (iv.minutes) return `${iv.minutes} minutes`
  }
  return '24 hours'
}

// =============================================================================
// CRUD WEB SOURCES
// =============================================================================

/**
 * Liste toutes les sources web
 */
export async function listWebSources(options: {
  category?: string
  isActive?: boolean
  healthStatus?: HealthStatus
  search?: string
  limit?: number
  offset?: number
} = {}): Promise<{ sources: WebSource[]; total: number }> {
  const { category, isActive, healthStatus, search, limit = 50, offset = 0 } = options

  let whereClause = 'WHERE 1=1'
  const params: (string | number | boolean)[] = []
  let paramIndex = 1

  if (category) {
    whereClause += ` AND category = $${paramIndex++}`
    params.push(category)
  }

  if (isActive !== undefined) {
    whereClause += ` AND is_active = $${paramIndex++}`
    params.push(isActive)
  }

  if (healthStatus) {
    whereClause += ` AND health_status = $${paramIndex++}`
    params.push(healthStatus)
  }

  if (search) {
    whereClause += ` AND (name ILIKE $${paramIndex} OR base_url ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`
    params.push(`%${search}%`)
    paramIndex++
  }

  // Count total
  const countResult = await db.query(
    `SELECT COUNT(*) FROM web_sources ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count)

  // Get sources
  const result = await db.query(
    `SELECT * FROM web_sources ${whereClause}
     ORDER BY priority DESC, name ASC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  )

  return {
    sources: result.rows.map(mapRowToWebSource),
    total,
  }
}

/**
 * Récupère une source par son ID
 */
export async function getWebSource(id: string): Promise<WebSource | null> {
  const result = await db.query(
    'SELECT * FROM web_sources WHERE id = $1',
    [id]
  )

  if (result.rows.length === 0) return null
  return mapRowToWebSource(result.rows[0])
}

/**
 * Récupère une source par son URL de base
 */
export async function getWebSourceByUrl(baseUrl: string): Promise<WebSource | null> {
  // Pour Google Drive, pas de normalisation nécessaire
  if (baseUrl.startsWith('gdrive://')) {
    const result = await db.query(
      `SELECT * FROM web_sources WHERE base_url = $1`,
      [baseUrl]
    )
    if (result.rows.length === 0) return null
    return mapRowToWebSource(result.rows[0])
  }

  // Normaliser l'URL pour les sources web
  const url = new URL(baseUrl)
  const normalized = url.origin + url.pathname.replace(/\/$/, '')

  const result = await db.query(
    `SELECT * FROM web_sources WHERE base_url = $1 OR base_url = $2`,
    [baseUrl, normalized]
  )

  if (result.rows.length === 0) return null
  return mapRowToWebSource(result.rows[0])
}

/**
 * Crée une nouvelle source web
 */
export async function createWebSource(
  input: CreateWebSourceInput,
  createdBy: string
): Promise<WebSource> {
  // Pour Google Drive, pas de normalisation nécessaire
  let normalizedUrl = input.baseUrl
  if (!input.baseUrl.startsWith('gdrive://')) {
    // Normaliser l'URL pour les sources web
    const url = new URL(input.baseUrl)
    normalizedUrl = url.origin + url.pathname.replace(/\/$/, '')
  }

  // Vérifier l'unicité
  const existing = await getWebSourceByUrl(normalizedUrl)
  if (existing) {
    throw new Error(`Une source existe déjà pour cette URL: ${existing.name}`)
  }

  const result = await db.query(
    `INSERT INTO web_sources (
      name, base_url, description, category, language, priority,
      crawl_frequency, max_depth, max_pages, requires_javascript,
      css_selectors, url_patterns, excluded_patterns,
      sitemap_url, rss_feed_url, use_sitemap, download_files,
      respect_robots_txt, rate_limit_ms, custom_headers,
      created_by, next_crawl_at, ignore_ssl_errors,
      seed_urls, form_crawl_config, auto_index_files, allowed_pdf_domains, drive_config
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7::interval, $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, $20,
      $21, NOW(), $22,
      $23, $24, $25, $26, $27
    )
    RETURNING *`,
    [
      input.name,
      normalizedUrl,
      input.description || null,
      input.category,
      input.language || 'fr',
      input.priority || 5,
      input.crawlFrequency || '24 hours',
      input.maxDepth || 10,
      input.maxPages || 10000,
      input.requiresJavascript || false,
      JSON.stringify(input.cssSelectors || {}),
      input.urlPatterns || [],
      input.excludedPatterns || [],
      input.sitemapUrl || null,
      input.rssFeedUrl || null,
      input.useSitemap || false,
      input.downloadFiles !== false,
      input.respectRobotsTxt !== false,
      input.rateLimitMs || 1000,
      JSON.stringify(input.customHeaders || {}),
      createdBy,
      input.ignoreSSLErrors || false,
      input.seedUrls || [],
      input.formCrawlConfig ? JSON.stringify(input.formCrawlConfig) : null,
      input.autoIndexFiles || false,
      input.allowedPdfDomains || [],
      input.driveConfig ? JSON.stringify(input.driveConfig) : null,
    ]
  )

  return mapRowToWebSource(result.rows[0])
}

/**
 * Met à jour une source web
 */
export async function updateWebSource(
  id: string,
  input: UpdateWebSourceInput
): Promise<WebSource | null> {
  const setClauses: string[] = []
  const params: (string | number | boolean | string[] | Record<string, unknown>)[] = []
  let paramIndex = 1

  if (input.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`)
    params.push(input.name)
  }

  if (input.baseUrl !== undefined) {
    setClauses.push(`base_url = $${paramIndex++}`)
    params.push(input.baseUrl)
  }

  if (input.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`)
    params.push(input.description)
  }

  if (input.category !== undefined) {
    setClauses.push(`category = $${paramIndex++}`)
    params.push(input.category)
  }

  if (input.language !== undefined) {
    setClauses.push(`language = $${paramIndex++}`)
    params.push(input.language)
  }

  if (input.priority !== undefined) {
    setClauses.push(`priority = $${paramIndex++}`)
    params.push(input.priority)
  }

  if (input.crawlFrequency !== undefined) {
    setClauses.push(`crawl_frequency = $${paramIndex++}::interval`)
    params.push(input.crawlFrequency)
  }

  if (input.maxDepth !== undefined) {
    setClauses.push(`max_depth = $${paramIndex++}`)
    params.push(input.maxDepth)
  }

  if (input.maxPages !== undefined) {
    setClauses.push(`max_pages = $${paramIndex++}`)
    params.push(input.maxPages)
  }

  if (input.requiresJavascript !== undefined) {
    setClauses.push(`requires_javascript = $${paramIndex++}`)
    params.push(input.requiresJavascript)
  }

  if (input.cssSelectors !== undefined) {
    setClauses.push(`css_selectors = $${paramIndex++}`)
    params.push(JSON.stringify(input.cssSelectors))
  }

  if (input.urlPatterns !== undefined) {
    setClauses.push(`url_patterns = $${paramIndex++}`)
    params.push(input.urlPatterns)
  }

  if (input.excludedPatterns !== undefined) {
    setClauses.push(`excluded_patterns = $${paramIndex++}`)
    params.push(input.excludedPatterns)
  }

  if (input.sitemapUrl !== undefined) {
    setClauses.push(`sitemap_url = $${paramIndex++}`)
    params.push(input.sitemapUrl)
  }

  if (input.rssFeedUrl !== undefined) {
    setClauses.push(`rss_feed_url = $${paramIndex++}`)
    params.push(input.rssFeedUrl)
  }

  if (input.useSitemap !== undefined) {
    setClauses.push(`use_sitemap = $${paramIndex++}`)
    params.push(input.useSitemap)
  }

  if (input.downloadFiles !== undefined) {
    setClauses.push(`download_files = $${paramIndex++}`)
    params.push(input.downloadFiles)
  }

  if (input.respectRobotsTxt !== undefined) {
    setClauses.push(`respect_robots_txt = $${paramIndex++}`)
    params.push(input.respectRobotsTxt)
  }

  if (input.rateLimitMs !== undefined) {
    setClauses.push(`rate_limit_ms = $${paramIndex++}`)
    params.push(input.rateLimitMs)
  }

  if (input.customHeaders !== undefined) {
    setClauses.push(`custom_headers = $${paramIndex++}`)
    params.push(JSON.stringify(input.customHeaders))
  }

  if (input.isActive !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`)
    params.push(input.isActive)
  }

  if (input.ignoreSSLErrors !== undefined) {
    setClauses.push(`ignore_ssl_errors = $${paramIndex++}`)
    params.push(input.ignoreSSLErrors)
  }

  if (input.seedUrls !== undefined) {
    setClauses.push(`seed_urls = $${paramIndex++}`)
    params.push(input.seedUrls as unknown as string)
  }

  if (input.formCrawlConfig !== undefined) {
    setClauses.push(`form_crawl_config = $${paramIndex++}`)
    params.push(JSON.stringify(input.formCrawlConfig) as unknown as string)
  }

  if (input.autoIndexFiles !== undefined) {
    setClauses.push(`auto_index_files = $${paramIndex++}`)
    params.push(input.autoIndexFiles)
  }

  if (input.allowedPdfDomains !== undefined) {
    setClauses.push(`allowed_pdf_domains = $${paramIndex++}`)
    params.push(input.allowedPdfDomains as unknown as string)
  }

  if (input.ragEnabled !== undefined) {
    setClauses.push(`rag_enabled = $${paramIndex++}`)
    params.push(input.ragEnabled)
  }

  if (setClauses.length === 0) {
    return getWebSource(id)
  }

  setClauses.push('updated_at = NOW()')
  params.push(id)

  const result = await db.query(
    `UPDATE web_sources SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  )

  if (result.rows.length === 0) return null

  // Cascade RAG: activer/désactiver les docs KB selon ragEnabled
  if (input.ragEnabled !== undefined) {
    if (!input.ragEnabled) {
      await db.query(
        `UPDATE knowledge_base SET is_active = false
         WHERE id IN (
           SELECT wp.knowledge_base_id FROM web_pages wp
           WHERE wp.web_source_id = $1 AND wp.knowledge_base_id IS NOT NULL
         )`,
        [id]
      )
    } else {
      await db.query(
        `UPDATE knowledge_base SET is_active = true
         WHERE id IN (
           SELECT wp.knowledge_base_id FROM web_pages wp
           WHERE wp.web_source_id = $1 AND wp.knowledge_base_id IS NOT NULL
         ) AND is_indexed = true`,
        [id]
      )
    }
  }

  // Cascade is_active: désactiver les docs KB si la source est arrêtée (stop crawl)
  // Réactivation via ragEnabled=true uniquement (crawl actif ≠ inclusion RAG automatique)
  if (input.isActive === false) {
    await db.query(
      `UPDATE knowledge_base SET is_active = false
       WHERE id IN (
         SELECT wp.knowledge_base_id FROM web_pages wp
         WHERE wp.web_source_id = $1 AND wp.knowledge_base_id IS NOT NULL
       )`,
      [id]
    )
  }

  return mapRowToWebSource(result.rows[0])
}

/**
 * Supprime une source web et toutes ses pages
 */
export async function deleteWebSource(id: string): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM web_sources WHERE id = $1',
    [id]
  )
  return (result.rowCount || 0) > 0
}

// =============================================================================
// PAGES
// =============================================================================

/**
 * Liste les pages d'une source
 */
export async function listWebPages(
  sourceId: string,
  options: {
    status?: string
    isIndexed?: boolean
    search?: string
    limit?: number
    offset?: number
  } = {}
): Promise<{ pages: WebPage[]; total: number }> {
  const { status, isIndexed, search, limit = 50, offset = 0 } = options

  let whereClause = 'WHERE web_source_id = $1'
  const params: (string | number | boolean)[] = [sourceId]
  let paramIndex = 2

  if (status) {
    whereClause += ` AND status = $${paramIndex++}`
    params.push(status)
  }

  if (isIndexed !== undefined) {
    whereClause += ` AND is_indexed = $${paramIndex++}`
    params.push(isIndexed)
  }

  if (search) {
    whereClause += ` AND (title ILIKE $${paramIndex} OR url ILIKE $${paramIndex})`
    params.push(`%${search}%`)
    paramIndex++
  }

  const countResult = await db.query(
    `SELECT COUNT(*) FROM web_pages ${whereClause}`,
    params
  )
  const total = parseInt(countResult.rows[0].count)

  const result = await db.query(
    `SELECT * FROM web_pages ${whereClause}
     ORDER BY last_crawled_at DESC NULLS LAST
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  )

  return {
    pages: result.rows.map(mapRowToWebPage),
    total,
  }
}

/**
 * Récupère une page par son ID
 */
export async function getWebPage(id: string): Promise<WebPage | null> {
  const result = await db.query(
    'SELECT * FROM web_pages WHERE id = $1',
    [id]
  )

  if (result.rows.length === 0) return null
  return mapRowToWebPage(result.rows[0])
}

/**
 * Supprime une page
 */
export async function deleteWebPage(id: string): Promise<boolean> {
  const result = await db.query(
    'DELETE FROM web_pages WHERE id = $1',
    [id]
  )
  return (result.rowCount || 0) > 0
}

// =============================================================================
// CRAWL JOBS
// =============================================================================

/**
 * Crée un job de crawl
 */
export async function createCrawlJob(
  sourceId: string,
  jobType: 'full_crawl' | 'incremental' | 'single_page' | 'reindex' = 'incremental',
  priority: number = 5,
  params: Record<string, unknown> = {}
): Promise<string> {
  const result = await db.query(
    `SELECT create_crawl_job($1, $2, $3, $4) as job_id`,
    [sourceId, jobType, priority, JSON.stringify(params)]
  )
  return result.rows[0].job_id
}

/**
 * Liste les jobs de crawl d'une source
 */
export async function listCrawlJobs(
  sourceId: string,
  options: { status?: string; limit?: number } = {}
): Promise<WebCrawlJob[]> {
  const { status, limit = 20 } = options

  let sql = 'SELECT * FROM web_crawl_jobs WHERE web_source_id = $1'
  const params: (string | number)[] = [sourceId]

  if (status) {
    sql += ' AND status = $2'
    params.push(status)
  }

  sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`
  params.push(limit)

  const result = await db.query(sql, params)
  return result.rows.map(mapRowToCrawlJob)
}

/**
 * Récupère les logs de crawl d'une source
 */
export async function listCrawlLogs(
  sourceId: string,
  options: { limit?: number } = {}
): Promise<WebCrawlLog[]> {
  const { limit = 20 } = options

  const result = await db.query(
    `SELECT * FROM web_crawl_logs
     WHERE web_source_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [sourceId, limit]
  )

  return result.rows.map(mapRowToCrawlLog)
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Récupère les statistiques globales
 */
export async function getWebSourcesStats(): Promise<WebSourceStats> {
  const result = await db.query('SELECT * FROM get_web_sources_stats()')
  const row = result.rows[0]

  return {
    totalSources: parseInt(row.total_sources) || 0,
    activeSources: parseInt(row.active_sources) || 0,
    healthySources: parseInt(row.healthy_sources) || 0,
    failingSources: parseInt(row.failing_sources) || 0,
    totalPages: parseInt(row.total_pages) || 0,
    indexedPages: parseInt(row.indexed_pages) || 0,
    pendingJobs: parseInt(row.pending_jobs) || 0,
    runningJobs: parseInt(row.running_jobs) || 0,
    byCategory: row.by_category || {},
  }
}

/**
 * Récupère les sources à crawler maintenant
 */
export async function getSourcesToCrawl(limit: number = 10): Promise<WebSource[]> {
  const result = await db.query(
    `SELECT * FROM get_sources_to_crawl($1)`,
    [limit]
  )

  // Récupérer les sources complètes
  const sources: WebSource[] = []
  for (const row of result.rows) {
    const source = await getWebSource(row.id)
    if (source) sources.push(source)
  }

  return sources
}

// =============================================================================
// WEB PAGE VERSIONING
// =============================================================================

/**
 * Crée une version snapshot d'une page web
 */
export async function createWebPageVersion(
  pageId: string,
  changeType: 'initial_crawl' | 'content_change' | 'metadata_change' | 'restore' = 'content_change'
): Promise<void> {
  try {
    await db.query('SELECT create_web_page_version($1, $2)', [pageId, changeType])
  } catch (error) {
    console.error(`[WebSources] Erreur création version pour page ${pageId}:`, error)
  }
}

/**
 * Récupère l'historique des versions d'une page
 */
export async function getWebPageVersions(
  pageId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ versions: Array<Record<string, unknown>>; total: number }> {
  const { limit = 20, offset = 0 } = options

  const countResult = await db.query(
    'SELECT COUNT(*) FROM web_page_versions WHERE web_page_id = $1',
    [pageId]
  )
  const total = parseInt(countResult.rows[0].count) || 0

  const result = await db.query(
    `SELECT * FROM web_page_versions
     WHERE web_page_id = $1
     ORDER BY version DESC
     LIMIT $2 OFFSET $3`,
    [pageId, limit, offset]
  )

  return { versions: result.rows, total }
}

/**
 * Récupère une version spécifique
 */
export async function getWebPageVersion(
  versionId: string
): Promise<Record<string, unknown> | null> {
  const result = await db.query(
    'SELECT * FROM web_page_versions WHERE id = $1',
    [versionId]
  )
  return result.rows[0] || null
}

/**
 * Restaure une version antérieure d'une page web
 */
export async function restoreWebPageVersion(
  pageId: string,
  versionId: string
): Promise<boolean> {
  const version = await getWebPageVersion(versionId)
  if (!version || version.web_page_id !== pageId) return false

  // Créer un snapshot de l'état actuel avant la restauration
  await createWebPageVersion(pageId, 'restore')

  // Restaurer les données de la version
  await db.query(
    `UPDATE web_pages SET
      title = $2,
      extracted_text = $3,
      word_count = $4,
      content_hash = $5,
      meta_description = $6,
      meta_author = $7,
      meta_date = $8,
      meta_keywords = $9,
      status = 'crawled',
      is_indexed = false,
      updated_at = NOW()
    WHERE id = $1`,
    [
      pageId,
      version.title,
      version.extracted_text,
      version.word_count,
      version.content_hash,
      version.meta_description,
      version.meta_author,
      version.meta_date,
      version.meta_keywords,
    ]
  )

  return true
}

// =============================================================================
// PAGE LISTING (pour la page super-admin/web-sources)
// =============================================================================

export type WebSourcesSortField = 'name' | 'last_crawl_at' | 'pages_count' | 'priority' | 'indexation_rate'
export type WebSourcesSortDir = 'asc' | 'desc'

/**
 * Récupère les données consolidées pour la page de listing des web sources
 * Remplace le SQL inline dans page.tsx
 */
export async function getWebSourcesListData(params: {
  category?: string
  status?: string
  search?: string
  language?: string
  sortBy?: WebSourcesSortField
  sortDir?: WebSourcesSortDir
  page: number
  limit?: number
}) {
  const limit = params.limit || 20
  const offset = (params.page - 1) * limit

  let whereClause = 'WHERE 1=1'
  const queryParams: (string | boolean | number)[] = []
  let paramIndex = 1

  if (params.category) {
    whereClause += ` AND ws.category = $${paramIndex++}`
    queryParams.push(params.category)
  }

  if (params.status === 'active') {
    whereClause += ` AND ws.is_active = true`
  } else if (params.status === 'inactive') {
    whereClause += ` AND ws.is_active = false`
  } else if (params.status === 'failing') {
    whereClause += ` AND ws.health_status IN ('failing', 'degraded')`
  }

  if (params.language) {
    whereClause += ` AND ws.language = $${paramIndex++}`
    queryParams.push(params.language)
  }

  if (params.search) {
    whereClause += ` AND (ws.name ILIKE $${paramIndex} OR ws.base_url ILIKE $${paramIndex})`
    queryParams.push(`%${params.search}%`)
    paramIndex++
  }

  // Tri
  const sortMap: Record<WebSourcesSortField, string> = {
    name: 'ws.name',
    last_crawl_at: 'ws.last_crawl_at',
    pages_count: 'pages_count',
    priority: 'ws.priority',
    indexation_rate: 'CASE WHEN pages_count > 0 THEN indexed_count::float / pages_count ELSE 0 END',
  }
  const sortField = sortMap[params.sortBy || 'priority'] || 'ws.priority'
  const sortDir = params.sortDir === 'asc' ? 'ASC' : 'DESC'
  const orderClause = `ORDER BY ${sortField} ${sortDir}${params.sortBy !== 'name' ? ', ws.name ASC' : ''}`

  // Count
  const countResult = await db.query(
    `SELECT COUNT(*) FROM web_sources ws ${whereClause}`,
    queryParams
  )
  const total = parseInt(countResult.rows[0].count, 10)

  // Sources avec stats
  const sourcesResult = await db.query(
    `SELECT
      ws.id,
      ws.name,
      ws.base_url,
      ws.description,
      ws.category,
      ws.language,
      ws.priority,
      ws.is_active,
      ws.rag_enabled,
      ws.health_status,
      ws.consecutive_failures,
      ws.last_crawl_at,
      ws.next_crawl_at,
      ws.total_pages_discovered,
      ws.avg_pages_per_crawl,
      ws.drive_config,
      (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id) as pages_count,
      (SELECT COUNT(*) FROM web_pages WHERE web_source_id = ws.id AND is_indexed = true) as indexed_count,
      (SELECT COUNT(*) FROM web_files WHERE web_source_id = ws.id) as files_count,
      (SELECT COUNT(*) FROM web_files WHERE web_source_id = ws.id AND is_indexed = true) as indexed_files_count
    FROM web_sources ws
    ${whereClause}
    ${orderClause}
    LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...queryParams, limit, offset]
  )

  // Stats globales
  let stats = {
    total_sources: 0,
    active_sources: 0,
    healthy_sources: 0,
    failing_sources: 0,
    total_pages: 0,
    indexed_pages: 0,
    pending_jobs: 0,
    running_jobs: 0,
  }

  try {
    const statsResult = await db.query('SELECT * FROM get_web_sources_stats()')
    if (statsResult.rows[0]) {
      stats = statsResult.rows[0]
    }
  } catch {
    try {
      const [sourcesStats, pagesStats, jobsStats] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*) as total_sources,
            COUNT(*) FILTER (WHERE is_active = true) as active_sources,
            COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_sources,
            COUNT(*) FILTER (WHERE health_status = 'failing') as failing_sources
          FROM web_sources
        `),
        db.query(`
          SELECT
            COUNT(*) as total_pages,
            COUNT(*) FILTER (WHERE is_indexed = true) as indexed_pages
          FROM web_pages
        `),
        db.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'pending') as pending_jobs,
            COUNT(*) FILTER (WHERE status = 'running') as running_jobs
          FROM web_crawl_jobs
        `),
      ])
      stats = {
        ...sourcesStats.rows[0],
        ...pagesStats.rows[0],
        ...jobsStats.rows[0],
      }
    } catch {
      // Garder les valeurs par défaut
    }
  }

  // Sérialiser les dates pour le client
  interface SerializedSource {
    id: string
    name: string
    base_url: string
    description: string | null
    category: string
    language: string
    priority: number
    is_active: boolean
    rag_enabled: boolean
    health_status: string
    consecutive_failures: number
    last_crawl_at: string | null
    next_crawl_at: string | null
    pages_count: number
    indexed_count: number
    total_pages_discovered: number
    avg_pages_per_crawl: number
    drive_config: Record<string, unknown> | null
    files_count: number
    indexed_files_count: number
  }

  const serializedSources: SerializedSource[] = sourcesResult.rows.map((source: Record<string, unknown>) => ({
    id: source.id as string,
    name: source.name as string,
    base_url: source.base_url as string,
    description: source.description as string | null,
    category: source.category as string,
    language: source.language as string,
    priority: source.priority as number,
    is_active: source.is_active as boolean,
    rag_enabled: (source.rag_enabled as boolean) ?? true,
    health_status: source.health_status as string,
    consecutive_failures: source.consecutive_failures as number,
    last_crawl_at: source.last_crawl_at ? (source.last_crawl_at as Date).toISOString() : null,
    next_crawl_at: source.next_crawl_at ? (source.next_crawl_at as Date).toISOString() : null,
    pages_count: Number(source.pages_count) || 0,
    indexed_count: Number(source.indexed_count) || 0,
    total_pages_discovered: source.total_pages_discovered as number,
    avg_pages_per_crawl: source.avg_pages_per_crawl as number,
    drive_config: (source.drive_config as Record<string, unknown>) || null,
    files_count: Number(source.files_count) || 0,
    indexed_files_count: Number(source.indexed_files_count) || 0,
  }))

  return {
    sources: serializedSources,
    total,
    totalPages: Math.ceil(total / limit),
    stats: {
      totalSources: Number(stats.total_sources) || 0,
      activeSources: Number(stats.active_sources) || 0,
      healthySources: Number(stats.healthy_sources) || 0,
      failingSources: Number(stats.failing_sources) || 0,
      totalPages: Number(stats.total_pages) || 0,
      indexedPages: Number(stats.indexed_pages) || 0,
      pendingJobs: Number(stats.pending_jobs) || 0,
      runningJobs: Number(stats.running_jobs) || 0,
    },
  }
}

// =============================================================================
// MAPPERS
// =============================================================================

function mapRowToWebSource(row: Record<string, unknown>): WebSource {
  return {
    id: row.id as string,
    name: row.name as string,
    baseUrl: row.base_url as string,
    description: row.description as string | null,
    faviconUrl: row.favicon_url as string | null,
    category: row.category as WebSource['category'],
    language: row.language as WebSource['language'],
    priority: row.priority as number,
    crawlFrequency: stringifyInterval(row.crawl_frequency),
    adaptiveFrequency: row.adaptive_frequency as boolean,
    cssSelectors: (row.css_selectors as CssSelectors) || {},
    urlPatterns: (row.url_patterns as string[]) || [],
    excludedPatterns: (row.excluded_patterns as string[]) || [],
    dynamicConfig: (row.dynamic_config as any) || null,
    extractionConfig: (row.extraction_config as any) || null,
    seedUrls: (row.seed_urls as string[]) || [],
    formCrawlConfig: (row.form_crawl_config as any) || null,
    maxDepth: row.max_depth as number,
    maxPages: row.max_pages as number,
    followLinks: row.follow_links as boolean,
    downloadFiles: row.download_files as boolean,
    requiresJavascript: row.requires_javascript as boolean,
    userAgent: row.user_agent as string,
    rateLimitMs: row.rate_limit_ms as number,
    timeoutMs: row.timeout_ms as number,
    respectRobotsTxt: row.respect_robots_txt as boolean,
    customHeaders: (row.custom_headers as Record<string, string>) || {},
    sitemapUrl: row.sitemap_url as string | null,
    rssFeedUrl: row.rss_feed_url as string | null,
    useSitemap: row.use_sitemap as boolean,
    isActive: row.is_active as boolean,
    ragEnabled: (row.rag_enabled as boolean) ?? true,
    healthStatus: row.health_status as HealthStatus,
    consecutiveFailures: row.consecutive_failures as number,
    lastCrawlAt: row.last_crawl_at ? new Date(row.last_crawl_at as string) : null,
    lastSuccessfulCrawlAt: row.last_successful_crawl_at ? new Date(row.last_successful_crawl_at as string) : null,
    nextCrawlAt: row.next_crawl_at ? new Date(row.next_crawl_at as string) : null,
    totalPagesDiscovered: row.total_pages_discovered as number,
    totalPagesIndexed: row.total_pages_indexed as number,
    avgPagesPerCrawl: row.avg_pages_per_crawl as number,
    avgCrawlDurationMs: row.avg_crawl_duration_ms as number,
    ignoreSSLErrors: (row.ignore_ssl_errors as boolean) || false,
    autoIndexFiles: (row.auto_index_files as boolean) || false,
    allowedPdfDomains: (row.allowed_pdf_domains as string[]) || [],
    driveConfig: (row.drive_config as any) || null, // ✅ Fix: Google Drive config mapping
    createdBy: row.created_by as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}

function mapRowToWebPage(row: Record<string, unknown>): WebPage {
  return {
    id: row.id as string,
    webSourceId: row.web_source_id as string,
    url: row.url as string,
    urlHash: row.url_hash as string,
    canonicalUrl: row.canonical_url as string | null,
    title: row.title as string | null,
    contentHash: row.content_hash as string | null,
    extractedText: row.extracted_text as string | null,
    wordCount: row.word_count as number,
    languageDetected: row.language_detected as string | null,
    metaDescription: row.meta_description as string | null,
    metaAuthor: row.meta_author as string | null,
    metaDate: row.meta_date ? new Date(row.meta_date as string) : null,
    metaKeywords: (row.meta_keywords as string[]) || [],
    structuredData: row.structured_data as Record<string, unknown> | null,
    linkedFiles: (row.linked_files as WebPage['linkedFiles']) || [],
    siteStructure: row.site_structure as Record<string, unknown> | null,
    etag: row.etag as string | null,
    lastModified: row.last_modified ? new Date(row.last_modified as string) : null,
    status: row.status as WebPage['status'],
    errorMessage: row.error_message as string | null,
    errorCount: row.error_count as number,
    knowledgeBaseId: row.knowledge_base_id as string | null,
    isIndexed: row.is_indexed as boolean,
    chunksCount: row.chunks_count as number,
    crawlDepth: row.crawl_depth as number,
    firstSeenAt: new Date(row.first_seen_at as string),
    lastCrawledAt: row.last_crawled_at ? new Date(row.last_crawled_at as string) : null,
    lastChangedAt: row.last_changed_at ? new Date(row.last_changed_at as string) : null,
    lastIndexedAt: row.last_indexed_at ? new Date(row.last_indexed_at as string) : null,
    freshnessScore: row.freshness_score as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}

function mapRowToCrawlJob(row: Record<string, unknown>): WebCrawlJob {
  return {
    id: row.id as string,
    webSourceId: row.web_source_id as string,
    jobType: row.job_type as WebCrawlJob['jobType'],
    status: row.status as WebCrawlJob['status'],
    priority: row.priority as number,
    params: (row.params as Record<string, unknown>) || {},
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    workerId: row.worker_id as string | null,
    pagesProcessed: row.pages_processed as number,
    pagesNew: row.pages_new as number,
    pagesChanged: row.pages_changed as number,
    pagesFailed: row.pages_failed as number,
    filesDownloaded: row.files_downloaded as number,
    errors: (row.errors as WebCrawlJob['errors']) || [],
    errorMessage: row.error_message as string | null,
    createdAt: new Date(row.created_at as string),
  }
}

function mapRowToCrawlLog(row: Record<string, unknown>): WebCrawlLog {
  return {
    id: row.id as string,
    webSourceId: row.web_source_id as string,
    jobId: row.job_id as string | null,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    durationMs: row.duration_ms as number | null,
    pagesCrawled: row.pages_crawled as number,
    pagesNew: row.pages_new as number,
    pagesChanged: row.pages_changed as number,
    pagesUnchanged: row.pages_unchanged as number,
    pagesFailed: row.pages_failed as number,
    pagesSkipped: row.pages_skipped as number,
    filesDownloaded: row.files_downloaded as number,
    bytesDownloaded: row.bytes_downloaded as number,
    chunksCreated: row.chunks_created as number,
    embeddingsGenerated: row.embeddings_generated as number,
    status: row.status as WebCrawlLog['status'],
    errorMessage: row.error_message as string | null,
    errors: (row.errors as WebCrawlLog['errors']) || [],
  }
}
