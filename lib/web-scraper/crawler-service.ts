/**
 * Service de crawling récursif
 * Gère le parcours d'un site web avec respect des limites et de la profondeur
 */

import { db } from '@/lib/db/postgres'
import type {
  WebSource,
  WebPage,
  CrawlResult,
  CrawlError,
  ScrapedContent,
  LinkedFile,
  PageStatus,
} from './types'
import { scrapeUrl, checkForChanges, downloadFile, generatePageIds } from './scraper-service'
import { hashUrl, hashContent, countWords, detectTextLanguage } from './content-extractor'
import { isUrlAllowed, getRobotsRules } from './robots-parser'
import { uploadFile } from '@/lib/storage/minio'

// Configuration du crawl
const KNOWLEDGE_BASE_BUCKET = 'knowledge-base'

interface CrawlOptions {
  maxPages?: number
  maxDepth?: number
  rateLimit?: number
  includePatterns?: RegExp[]
  excludePatterns?: RegExp[]
  downloadFiles?: boolean
  incrementalMode?: boolean
}

interface CrawlState {
  visited: Set<string>
  queue: Array<{ url: string; depth: number }>
  pagesProcessed: number
  pagesNew: number
  pagesChanged: number
  pagesFailed: number
  filesDownloaded: number
  errors: CrawlError[]
}

/**
 * Démarre un crawl complet pour une source
 */
export async function crawlSource(
  source: WebSource,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceMaxPages = s.maxPages ?? s.max_pages ?? 100
  const sourceMaxDepth = s.maxDepth ?? s.max_depth ?? 3
  const sourceRateLimit = s.rateLimitMs ?? s.rate_limit_ms ?? 1000
  const sourceUrlPatterns = s.urlPatterns ?? s.url_patterns ?? []
  const sourceExcludedPatterns = s.excludedPatterns ?? s.excluded_patterns ?? []
  const sourceDownloadFiles = s.downloadFiles ?? s.download_files ?? false
  const sourceBaseUrl = s.baseUrl ?? s.base_url
  const sourceUserAgent = s.userAgent ?? s.user_agent ?? 'QadhyaBot/1.0'
  const sourceRequiresJs = s.requiresJavascript ?? s.requires_javascript ?? false
  const sourceCssSelectors = s.cssSelectors ?? s.css_selectors ?? {}
  const sourceName = s.name
  const sourceTimeoutMs = s.timeoutMs ?? s.timeout_ms ?? 30000
  const sourceFollowLinks = s.followLinks ?? s.follow_links ?? true
  const sourceId = s.id

  const {
    maxPages = sourceMaxPages,
    maxDepth = sourceMaxDepth,
    rateLimit = sourceRateLimit,
    includePatterns = sourceUrlPatterns.map((p: string) => new RegExp(p)),
    excludePatterns = sourceExcludedPatterns.map((p: string) => new RegExp(p)),
    downloadFiles = sourceDownloadFiles,
    incrementalMode = true,
  } = options

  // État du crawl
  const state: CrawlState = {
    visited: new Set<string>(),
    queue: [{ url: sourceBaseUrl, depth: 0 }],
    pagesProcessed: 0,
    pagesNew: 0,
    pagesChanged: 0,
    pagesFailed: 0,
    filesDownloaded: 0,
    errors: [],
  }

  // Charger les URLs déjà visitées si mode incrémental
  if (incrementalMode) {
    const existingPages = await getExistingPages(sourceId)
    for (const page of existingPages) {
      state.visited.add(page.urlHash)
    }
  }

  // Récupérer les règles robots.txt
  const robotsRules = await getRobotsRules(sourceBaseUrl, sourceUserAgent)
  const effectiveRateLimit = Math.max(rateLimit, robotsRules.crawlDelay || 0)

  console.log(`[Crawler] Démarrage crawl ${sourceName}`)
  console.log(`[Crawler] Rate limit: ${effectiveRateLimit}ms, Max pages: ${maxPages}, Max depth: ${maxDepth}`)

  // Boucle principale de crawl
  while (state.queue.length > 0 && state.pagesProcessed < maxPages) {
    const { url, depth } = state.queue.shift()!

    // Vérifier la profondeur max
    if (depth > maxDepth) continue

    // Vérifier si déjà visité (par hash d'URL)
    const urlHash = hashUrl(url)
    if (state.visited.has(urlHash)) continue
    state.visited.add(urlHash)

    // Vérifier les patterns d'exclusion
    if (excludePatterns.some((p: RegExp) => p.test(url))) {
      console.log(`[Crawler] URL exclue: ${url}`)
      continue
    }

    // Vérifier les patterns d'inclusion (si définis)
    if (includePatterns.length > 0 && !includePatterns.some((p: RegExp) => p.test(url))) {
      continue
    }

    // Vérifier robots.txt
    const robotsCheck = await isUrlAllowed(url, sourceUserAgent)
    if (!robotsCheck.allowed) {
      console.log(`[Crawler] URL bloquée par robots.txt: ${url}`)
      continue
    }

    try {
      // Scraper la page
      const result = await processPage(source, url, depth, state, {
        downloadFiles,
        incrementalMode,
      })

      if (result.success) {
        // Ajouter les liens découverts à la queue
        if (sourceFollowLinks && result.links) {
          for (const link of result.links) {
            const linkHash = hashUrl(link)
            if (!state.visited.has(linkHash)) {
              state.queue.push({ url: link, depth: depth + 1 })
            }
          }
        }
      }

      state.pagesProcessed++

    } catch (error) {
      state.pagesFailed++
      state.errors.push({
        url,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        timestamp: new Date().toISOString(),
      })
      console.error(`[Crawler] Erreur page ${url}:`, error)
    }

    // Rate limiting
    if (effectiveRateLimit > 0 && state.queue.length > 0) {
      await sleep(effectiveRateLimit)
    }
  }

  console.log(`[Crawler] Terminé: ${state.pagesProcessed} pages, ${state.pagesNew} nouvelles, ${state.pagesChanged} modifiées, ${state.pagesFailed} erreurs`)

  return {
    success: state.pagesFailed < state.pagesProcessed / 2,
    pagesProcessed: state.pagesProcessed,
    pagesNew: state.pagesNew,
    pagesChanged: state.pagesChanged,
    pagesFailed: state.pagesFailed,
    filesDownloaded: state.filesDownloaded,
    errors: state.errors,
  }
}

/**
 * Traite une page individuelle
 */
async function processPage(
  source: WebSource,
  url: string,
  depth: number,
  state: CrawlState,
  options: { downloadFiles: boolean; incrementalMode: boolean }
): Promise<{ success: boolean; links?: string[] }> {
  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceId = s.id
  const sourceUserAgent = s.userAgent ?? s.user_agent ?? 'QadhyaBot/1.0'

  const urlHash = hashUrl(url)

  // Vérifier si la page existe déjà
  const existingPage = await getPageByUrlHash(sourceId, urlHash)

  // Mode incrémental: vérifier si changement
  if (options.incrementalMode && existingPage) {
    const changeCheck = await checkForChanges(url, {
      etag: existingPage.etag || undefined,
      lastModified: existingPage.lastModified || undefined,
      userAgent: sourceUserAgent,
    })

    if (!changeCheck.changed) {
      console.log(`[Crawler] Pas de changement: ${url}`)
      await updatePageStatus(existingPage.id, 'unchanged')
      return { success: true, links: [] }
    }
  }

  // Scraper la page
  const scrapeResult = await scrapeUrl(url, source)

  if (!scrapeResult.success || !scrapeResult.content) {
    if (existingPage) {
      await updatePageError(existingPage.id, scrapeResult.error || 'Erreur scraping')
    }
    state.pagesFailed++
    throw new Error(scrapeResult.error || 'Erreur scraping')
  }

  const content = scrapeResult.content
  const contentHash = hashContent(content.content)

  // Vérifier si le contenu a vraiment changé
  if (existingPage && existingPage.contentHash === contentHash) {
    console.log(`[Crawler] Contenu identique: ${url}`)
    await updatePageTimestamp(existingPage.id, scrapeResult.fetchResult)
    return { success: true, links: content.links }
  }

  // Télécharger les fichiers liés si demandé
  let downloadedFiles: LinkedFile[] = content.files
  if (options.downloadFiles && content.files.length > 0) {
    downloadedFiles = await downloadLinkedFiles(source, content.files)
    state.filesDownloaded += downloadedFiles.filter(f => f.downloaded).length
  }

  // Sauvegarder ou mettre à jour la page
  if (existingPage) {
    await updatePage(existingPage.id, {
      content,
      contentHash,
      files: downloadedFiles,
      fetchResult: scrapeResult.fetchResult,
    })
    state.pagesChanged++
    console.log(`[Crawler] Page mise à jour: ${url}`)
  } else {
    await insertPage(sourceId, url, urlHash, depth, {
      content,
      contentHash,
      files: downloadedFiles,
      fetchResult: scrapeResult.fetchResult,
    })
    state.pagesNew++
    console.log(`[Crawler] Nouvelle page: ${url}`)
  }

  return { success: true, links: content.links }
}

/**
 * Télécharge les fichiers liés (PDF, DOCX)
 */
async function downloadLinkedFiles(
  source: WebSource,
  files: LinkedFile[]
): Promise<LinkedFile[]> {
  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceId = s.id
  const sourceUserAgent = s.userAgent ?? s.user_agent ?? 'QadhyaBot/1.0'
  const sourceTimeoutMs = s.timeoutMs ?? s.timeout_ms ?? 30000

  const result: LinkedFile[] = []

  for (const file of files) {
    // Ne pas re-télécharger si déjà fait
    if (file.downloaded) {
      result.push(file)
      continue
    }

    try {
      const downloadResult = await downloadFile(file.url, {
        userAgent: sourceUserAgent,
        timeout: sourceTimeoutMs,
      })

      if (downloadResult.success && downloadResult.buffer) {
        // Upload vers MinIO
        const minioPath = `web-scraper/${sourceId}/${Date.now()}_${file.filename}`
        await uploadFile(
          downloadResult.buffer,
          minioPath,
          { sourceUrl: file.url, sourceId: sourceId },
          KNOWLEDGE_BASE_BUCKET
        )

        result.push({
          ...file,
          downloaded: true,
          minioPath,
          size: downloadResult.size,
        })
        console.log(`[Crawler] Fichier téléchargé: ${file.filename}`)
      } else {
        result.push({ ...file, downloaded: false })
        console.warn(`[Crawler] Échec téléchargement: ${file.url} - ${downloadResult.error}`)
      }
    } catch (error) {
      result.push({ ...file, downloaded: false })
      console.error(`[Crawler] Erreur téléchargement ${file.url}:`, error)
    }
  }

  return result
}

// =============================================================================
// FONCTIONS BASE DE DONNÉES
// =============================================================================

/**
 * Récupère les pages existantes pour une source
 */
async function getExistingPages(sourceId: string): Promise<{ urlHash: string }[]> {
  const result = await db.query(
    'SELECT url_hash FROM web_pages WHERE web_source_id = $1',
    [sourceId]
  )
  return result.rows.map(r => ({ urlHash: r.url_hash }))
}

/**
 * Récupère une page par son hash d'URL
 */
async function getPageByUrlHash(sourceId: string, urlHash: string): Promise<WebPage | null> {
  const result = await db.query(
    `SELECT * FROM web_pages WHERE web_source_id = $1 AND url_hash = $2`,
    [sourceId, urlHash]
  )

  if (result.rows.length === 0) return null
  return mapRowToWebPage(result.rows[0])
}

/**
 * Insère une nouvelle page
 */
async function insertPage(
  sourceId: string,
  url: string,
  urlHash: string,
  depth: number,
  data: {
    content: ScrapedContent
    contentHash: string
    files: LinkedFile[]
    fetchResult?: { etag?: string; lastModified?: Date | null }
  }
): Promise<void> {
  const { content, contentHash, files, fetchResult } = data

  await db.query(
    `INSERT INTO web_pages (
      web_source_id, url, url_hash, canonical_url,
      title, content_hash, extracted_text, word_count, language_detected,
      meta_description, meta_author, meta_date, meta_keywords, structured_data,
      linked_files, etag, last_modified, site_structure,
      status, crawl_depth, last_crawled_at, first_seen_at
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14,
      $15, $16, $17, $18,
      'crawled', $19, NOW(), NOW()
    )`,
    [
      sourceId,
      url,
      urlHash,
      url, // canonical = url pour l'instant
      content.title,
      contentHash,
      content.content,
      countWords(content.content),
      content.language || detectTextLanguage(content.content),
      content.description,
      content.author,
      content.date,
      content.keywords,
      content.structuredData ? JSON.stringify(content.structuredData) : null,
      JSON.stringify(files),
      fetchResult?.etag,
      fetchResult?.lastModified,
      content.siteStructure ? JSON.stringify(content.siteStructure) : null,
      depth,
    ]
  )
}

/**
 * Met à jour une page existante
 */
async function updatePage(
  pageId: string,
  data: {
    content: ScrapedContent
    contentHash: string
    files: LinkedFile[]
    fetchResult?: { etag?: string; lastModified?: Date | null }
  }
): Promise<void> {
  const { content, contentHash, files, fetchResult } = data

  await db.query(
    `UPDATE web_pages SET
      title = $2,
      content_hash = $3,
      extracted_text = $4,
      word_count = $5,
      language_detected = $6,
      meta_description = $7,
      meta_author = $8,
      meta_date = $9,
      meta_keywords = $10,
      structured_data = $11,
      linked_files = $12,
      etag = $13,
      last_modified = $14,
      site_structure = $15,
      status = 'crawled',
      last_crawled_at = NOW(),
      last_changed_at = NOW(),
      is_indexed = false,
      updated_at = NOW()
    WHERE id = $1`,
    [
      pageId,
      content.title,
      contentHash,
      content.content,
      countWords(content.content),
      content.language || detectTextLanguage(content.content),
      content.description,
      content.author,
      content.date,
      content.keywords,
      content.structuredData ? JSON.stringify(content.structuredData) : null,
      JSON.stringify(files),
      fetchResult?.etag,
      fetchResult?.lastModified,
      content.siteStructure ? JSON.stringify(content.siteStructure) : null,
    ]
  )
}

/**
 * Met à jour le status d'une page
 */
async function updatePageStatus(pageId: string, status: PageStatus): Promise<void> {
  await db.query(
    `UPDATE web_pages SET status = $2, last_crawled_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [pageId, status]
  )
}

/**
 * Met à jour le timestamp d'une page sans changement
 */
async function updatePageTimestamp(
  pageId: string,
  fetchResult?: { etag?: string; lastModified?: Date | null }
): Promise<void> {
  await db.query(
    `UPDATE web_pages SET
      etag = COALESCE($2, etag),
      last_modified = COALESCE($3, last_modified),
      last_crawled_at = NOW(),
      status = 'unchanged',
      updated_at = NOW()
    WHERE id = $1`,
    [pageId, fetchResult?.etag, fetchResult?.lastModified]
  )
}

/**
 * Enregistre une erreur sur une page
 */
async function updatePageError(pageId: string, error: string): Promise<void> {
  await db.query(
    `UPDATE web_pages SET
      status = 'failed',
      error_message = $2,
      error_count = error_count + 1,
      last_crawled_at = NOW(),
      updated_at = NOW()
    WHERE id = $1`,
    [pageId, error]
  )
}

/**
 * Map une row DB vers WebPage
 */
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
    linkedFiles: (row.linked_files as LinkedFile[]) || [],
    siteStructure: row.site_structure as Record<string, unknown> | null,
    etag: row.etag as string | null,
    lastModified: row.last_modified ? new Date(row.last_modified as string) : null,
    status: row.status as PageStatus,
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

// =============================================================================
// UTILITAIRES
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Crawle une seule page
 */
export async function crawlSinglePage(
  source: WebSource,
  url: string
): Promise<{ success: boolean; page?: WebPage; error?: string }> {
  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceId = s.id

  try {
    const scrapeResult = await scrapeUrl(url, source)

    if (!scrapeResult.success || !scrapeResult.content) {
      return {
        success: false,
        error: scrapeResult.error || 'Erreur scraping',
      }
    }

    const content = scrapeResult.content
    const urlHash = hashUrl(url)
    const contentHash = hashContent(content.content)

    // Vérifier si la page existe
    const existingPage = await getPageByUrlHash(sourceId, urlHash)

    if (existingPage) {
      await updatePage(existingPage.id, {
        content,
        contentHash,
        files: content.files,
        fetchResult: scrapeResult.fetchResult,
      })

      const updatedPage = await getPageByUrlHash(sourceId, urlHash)
      return { success: true, page: updatedPage || undefined }
    } else {
      await insertPage(sourceId, url, urlHash, 0, {
        content,
        contentHash,
        files: content.files,
        fetchResult: scrapeResult.fetchResult,
      })

      const newPage = await getPageByUrlHash(sourceId, urlHash)
      return { success: true, page: newPage || undefined }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    }
  }
}
