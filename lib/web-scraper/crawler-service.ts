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
  FormCrawlConfig,
} from './types'
import { scrapeUrl, checkForChanges, downloadFile, generatePageIds, fetchHtml } from './scraper-service'
import { hashUrl, hashContent, countWords, detectTextLanguage } from './content-extractor'
import { isUrlAllowed, getRobotsRules } from './robots-parser'
import { uploadFile } from '@/lib/storage/minio'
import { withRetry, isRetryableError, DEFAULT_RETRY_CONFIG } from './retry-utils'
import { getRandomDelay, shouldAddLongPause, detectBan } from './anti-ban-utils'
import { recordCrawlMetric, markSourceAsBanned, canSourceCrawl } from './monitoring-service'

// Configuration du crawl
const WEB_FILES_BUCKET = 'web-files'
const MAX_ERRORS_KEPT = 200          // Limiter les erreurs en mémoire
const PROGRESS_LOG_INTERVAL = 25     // Log progression toutes les N pages
const MAX_CONSECUTIVE_FAILURES = 20  // Arrêter après N échecs consécutifs

// 🚀 CRAWL ULTRA-RAPIDE : Concurrency adaptée selon mode (static vs dynamic)
const CRAWL_CONCURRENCY_STATIC = parseInt(process.env.CRAWLER_CONCURRENCY_STATIC || '40', 10)   // Fetch statique ultra-rapide
const CRAWL_CONCURRENCY_DYNAMIC = parseInt(process.env.CRAWLER_CONCURRENCY_DYNAMIC || '4', 10)  // Playwright multi-browser
const CRAWL_CONCURRENCY = parseInt(process.env.CRAWLER_CONCURRENCY || '15', 10)                 // Défaut (legacy)

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
  status?: 'running' | 'banned' | 'completed' | 'failed'
}

/**
 * Vérifie si une URL est dans le scope de la baseUrl
 * Ex: baseUrl = "https://9anoun.tn/kb/codes"
 *     ✅ "https://9anoun.tn/kb/codes" → true
 *     ✅ "https://9anoun.tn/kb/codes/code-penal" → true
 *     ❌ "https://9anoun.tn/kb/jurisprudence" → false
 *     ❌ "https://9anoun.tn/" → false
 *
 * Ex: baseUrl = "https://9anoun.tn/" (racine)
 *     ✅ "https://9anoun.tn/" → true
 *     ✅ "https://9anoun.tn/kb/codes" → true
 *     ✅ "https://9anoun.tn/anything" → true
 */
function isUrlInScope(url: string, baseUrl: string): boolean {
  try {
    const urlObj = new URL(url)
    const baseUrlObj = new URL(baseUrl)

    // Vérifier que le domaine est identique
    if (urlObj.hostname !== baseUrlObj.hostname) {
      return false
    }

    // Vérifier que le chemin de l'URL commence par le chemin de la baseUrl
    const urlPath = urlObj.pathname
    const basePath = baseUrlObj.pathname

    // Normaliser les chemins (enlever trailing slash sauf pour la racine)
    const normalizedUrlPath = urlPath === '/'
      ? '/'
      : (urlPath.endsWith('/') ? urlPath.slice(0, -1) : urlPath)

    const normalizedBasePath = basePath === '/'
      ? '/'
      : (basePath.endsWith('/') ? basePath.slice(0, -1) : basePath)

    // Cas spécial : si la baseUrl est la racine du site, tout est dans le scope
    if (normalizedBasePath === '/') {
      return true
    }

    // L'URL doit commencer par le chemin de base
    return normalizedUrlPath === normalizedBasePath || normalizedUrlPath.startsWith(normalizedBasePath + '/')
  } catch (error) {
    console.error(`[Crawler] Erreur lors de la vérification du scope pour ${url}:`, error)
    return false
  }
}

/**
 * Démarre un crawl complet pour une source
 */
export async function crawlSource(
  source: WebSource,
  options: CrawlOptions = {}
): Promise<CrawlResult> {
  // Router: Google Drive vs Web
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const baseUrl = s.baseUrl ?? s.base_url
  if (baseUrl?.startsWith('gdrive://')) {
    const { crawlGoogleDriveFolder } = await import('./gdrive-crawler-service')
    return crawlGoogleDriveFolder(source, options)
  }

  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const sourceSeedUrls: string[] = s.seedUrls ?? s.seed_urls ?? []
  const sourceFormCrawlConfig: FormCrawlConfig | null = s.formCrawlConfig ?? s.form_crawl_config ?? null
  const sourceIgnoreSSLErrors: boolean = s.ignoreSSLErrors ?? s.ignore_ssl_errors ?? false

  const {
    maxPages = sourceMaxPages,
    maxDepth = sourceMaxDepth,
    rateLimit = sourceRateLimit,
    includePatterns = sourceUrlPatterns.flatMap((p: string) => {
      try { return [new RegExp(p)] } catch { console.warn(`[Crawler] Pattern inclus invalide ignoré: "${p}"`); return [] }
    }),
    excludePatterns = sourceExcludedPatterns.flatMap((p: string) => {
      try { return [new RegExp(p)] } catch { console.warn(`[Crawler] Pattern exclu invalide ignoré: "${p}"`); return [] }
    }),
    downloadFiles = sourceDownloadFiles,
    incrementalMode = true,
  } = options

  // 🤖 DÉTECTION AUTOMATIQUE DU SITEMAP
  console.log(`[Crawler] 🔍 Détection automatique du sitemap pour ${sourceName}...`)
  const { detectAndParseSitemap } = await import('./sitemap-auto-detector')
  const sitemapResult = await detectAndParseSitemap(sourceBaseUrl)

  // Construire la queue initiale
  const seedUrlSet = new Set<string>(sourceSeedUrls)
  const initialQueue: Array<{ url: string; depth: number }> = []

  // Si sitemap trouvé, utiliser toutes ses URLs (priorité absolue)
  if (sitemapResult.hasSitemap && sitemapResult.pageUrls.length > 0) {
    // Filtrer les URLs du sitemap par domaine de la source (évite les URLs internes type pgportail.local)
    const baseUrlHostname = new URL(sourceBaseUrl).hostname
    const filteredSitemapUrls = sitemapResult.pageUrls.filter(url => {
      try { return new URL(url).hostname === baseUrlHostname } catch { return false }
    })
    const skipped = sitemapResult.pageUrls.length - filteredSitemapUrls.length
    if (skipped > 0) {
      console.log(`[Crawler] ⚠️ Sitemap: ${skipped} URLs hors-domaine ignorées (domaine attendu: ${baseUrlHostname})`)
    }
    if (filteredSitemapUrls.length > 0) {
      console.log(`[Crawler] ✓ Sitemap détecté: ${filteredSitemapUrls.length} URLs ajoutées à la queue`)
      // Ajouter les URLs filtrées du sitemap avec depth=1
      filteredSitemapUrls.forEach(url => {
        initialQueue.push({ url, depth: 1 })
      })
    } else {
      // Sitemap inutilisable (toutes URLs hors-domaine) → fallback mode classique
      console.log(`[Crawler] ⚠️ Sitemap vide après filtrage, fallback mode classique`)
      initialQueue.push({ url: sourceBaseUrl, depth: 0 })
      sourceSeedUrls.forEach((u: string) => {
        initialQueue.push({ url: u, depth: 1 })
      })
    }
  } else {
    // Pas de sitemap: mode classique avec base URL + seed URLs
    console.log(`[Crawler] ⚠️ Aucun sitemap trouvé, mode crawl classique`)
    initialQueue.push({ url: sourceBaseUrl, depth: 0 })
    sourceSeedUrls.forEach(u => {
      initialQueue.push({ url: u, depth: 1 })
    })
  }

  // État du crawl
  const state: CrawlState = {
    visited: new Set<string>(),
    queue: initialQueue,
    pagesProcessed: 0,
    pagesNew: 0,
    pagesChanged: 0,
    pagesFailed: 0,
    filesDownloaded: 0,
    errors: [],
    status: 'running',
  }

  // Charger les URLs existantes (pour priorisation queue + mode incrémental)
  const existingUrlHashes = new Set<string>()
  const existingPages = await getExistingPages(sourceId)
  for (const page of existingPages) {
    existingUrlHashes.add(page.urlHash)
    if (incrementalMode) {
      state.visited.add(page.urlHash)
    }
  }

  // Récupérer les règles robots.txt (si activé)
  const sourceRespectRobots = s.respectRobotsTxt ?? s.respect_robots_txt ?? true
  const robotsRules = sourceRespectRobots
    ? await getRobotsRules(sourceBaseUrl, sourceUserAgent)
    : { allowed: true, crawlDelay: null, sitemaps: [], disallowedPaths: [] }
  const effectiveRateLimit = Math.max(rateLimit, robotsRules.crawlDelay || 0)

  // 🚀 CRAWL ULTRA-RAPIDE : Choisir concurrency selon mode (static vs dynamic)
  const isDynamicMode = s.requiresJavascript ?? s.requires_javascript ?? false
  const effectiveConcurrency = isDynamicMode ? CRAWL_CONCURRENCY_DYNAMIC : CRAWL_CONCURRENCY_STATIC
  const crawlMode = isDynamicMode ? 'dynamic (Playwright multi-browser)' : 'static (fetch ultra-rapide)'

  console.log(`[Crawler] Démarrage crawl ${sourceName}`)
  console.log(`[Crawler] Mode: ${crawlMode}, Concurrency: ${effectiveConcurrency}, Rate limit: ${effectiveRateLimit}ms`)
  console.log(`[Crawler] Max pages: ${maxPages}, Max depth: ${maxDepth}`)
  console.log(`[Crawler] ${existingUrlHashes.size} pages existantes en DB, mode ${incrementalMode ? 'incrémental' : 'full_crawl'}`)
  console.log(`[Crawler] Queue initiale: ${state.queue.length} URLs`, state.queue.map((q) => q.url))
  console.log(`[Crawler] Include patterns: ${includePatterns.length}`, includePatterns.map((p: RegExp) => p.source))
  console.log(`[Crawler] Exclude patterns: ${excludePatterns.length}`, excludePatterns.map((p: RegExp) => p.source))

  // Vérifier si la source peut crawler (bannissement, quotas)
  const crawlCheck = await canSourceCrawl(sourceId)
  if (!crawlCheck.canCrawl) {
    console.warn(`[Crawler] Crawl impossible pour ${sourceName}: ${crawlCheck.reason}`)
    return {
      success: false,
      pagesProcessed: 0,
      pagesNew: 0,
      pagesChanged: 0,
      pagesFailed: 0,
      filesDownloaded: 0,
      errors: [{
        url: sourceBaseUrl,
        error: crawlCheck.reason || 'Crawl bloqué',
        timestamp: new Date().toISOString(),
      }],
    }
  }

  const crawlStartTime = Date.now()

  // Graceful shutdown sur SIGINT/SIGTERM
  let shutdownRequested = false
  const onShutdown = () => {
    if (!shutdownRequested) {
      shutdownRequested = true
      console.log(`[Crawler] Arrêt demandé, finalisation en cours...`)
    }
  }
  process.on('SIGINT', onShutdown)
  process.on('SIGTERM', onShutdown)

  let consecutiveFailures = 0

  try {
  // Boucle principale de crawl (par batch concurrent)
  while (state.queue.length > 0 && state.pagesProcessed < maxPages && !shutdownRequested) {
    // Collecter un batch de pages à traiter (jusqu'à effectiveConcurrency)
    const batch: Array<{ url: string; depth: number }> = []
    while (batch.length < effectiveConcurrency && state.queue.length > 0) {
      const item = state.queue.shift()!
      if (item.depth > maxDepth) continue
      const urlHash = hashUrl(item.url)
      if (state.visited.has(urlHash)) continue
      if (/\.(pdf|docx?|xlsx?|pptx?|zip|rar)$/i.test(item.url)) continue
      if (excludePatterns.some((p: RegExp) => p.test(item.url))) continue
      // Les seed URLs et la base URL sont toujours incluses (pas de filtre includePatterns)
      const isSeed = seedUrlSet.has(item.url) || item.url === sourceBaseUrl
      if (!isSeed && includePatterns.length > 0 && !includePatterns.some((p: RegExp) => p.test(item.url))) continue
      state.visited.add(urlHash)
      batch.push(item)
    }

    if (batch.length === 0) continue

    // Vérifier robots.txt pour le batch (en parallèle)
    let filteredBatch = batch
    if (sourceRespectRobots) {
      const robotsChecks = await Promise.all(
        batch.map(item => isUrlAllowed(item.url, sourceUserAgent))
      )
      filteredBatch = batch.filter((_, i) => robotsChecks[i].allowed)
      const blocked = batch.length - filteredBatch.length
      if (blocked > 0) console.log(`[Crawler] ${blocked} URL(s) bloquée(s) par robots.txt`)
    }

    if (filteredBatch.length === 0) continue

    // Traiter le batch en parallèle (chaque worker gère ses propres erreurs)
    const batchResults = await Promise.all(
      filteredBatch.map(async ({ url, depth }) => {
        const isSeedUrl = seedUrlSet.has(url)
        try {
          const result = await withRetry(
            () => processPage(source, url, depth, state, { downloadFiles, incrementalMode, isSeedUrl }),
            (error) => {
              const statusCode = error instanceof Error && 'statusCode' in error
                ? (error as any).statusCode
                : undefined
              return isRetryableError(error, statusCode)
            },
            DEFAULT_RETRY_CONFIG,
            (attempt, delay, error) => {
              console.warn(
                `[Crawler] Retry ${attempt + 1}/${DEFAULT_RETRY_CONFIG.maxRetries} ` +
                `pour ${url} dans ${delay}ms (erreur: ${error instanceof Error ? error.message : 'inconnue'})`
              )
            }
          )
          return { url, depth, isSeedUrl, ...result, error: undefined as Error | undefined }
        } catch (error) {
          return {
            url, depth, isSeedUrl,
            success: false, links: [] as string[],
            fetchResult: undefined as import('./types').FetchResult | undefined,
            error: error instanceof Error ? error : new Error(String(error)),
          }
        }
      })
    )

    // Traiter les résultats du batch
    for (const result of batchResults) {
      if (result.success) {
        consecutiveFailures = 0
        state.pagesProcessed++

        // Ajouter les liens découverts avec priorisation (nouvelles URLs en premier)
        const addLinkToQueue = (link: string, parentDepth: number) => {
          const linkHash = hashUrl(link)
          if (!state.visited.has(linkHash) && isUrlInScope(link, sourceBaseUrl)) {
            if (existingUrlHashes.has(linkHash)) {
              state.queue.push({ url: link, depth: parentDepth + 1 })   // Existante → fin
            } else {
              state.queue.unshift({ url: link, depth: parentDepth + 1 }) // Nouvelle → début
            }
          }
        }

        // Liens statiques HTML
        if (sourceFollowLinks && result.links) {
          for (const link of result.links) {
            addLinkToQueue(link, result.depth)
          }
        }

        // Liens dynamiques découverts via JavaScript
        if (sourceFollowLinks && result.fetchResult?.discoveredUrls) {
          for (const link of result.fetchResult.discoveredUrls) {
            addLinkToQueue(link, result.depth)
          }
        }

        // Crawl de formulaire si configuré et URL est une seed URL
        if (sourceFormCrawlConfig && result.isSeedUrl) {
          try {
            const formLinks = await crawlFormResults(
              sourceFormCrawlConfig,
              result.url,
              sourceIgnoreSSLErrors,
              effectiveRateLimit,
            )
            for (const link of formLinks) {
              addLinkToQueue(link, result.depth)
            }
            console.log(`[Crawler] Formulaire: ${formLinks.length} liens découverts depuis ${result.url}`)
          } catch (formError) {
            console.error(`[Crawler] Erreur crawl formulaire pour ${result.url}:`, formError)
            pushError(state, result.url, `Form crawl: ${formError instanceof Error ? formError.message : 'Erreur inconnue'}`)
          }
        }
      } else {
        // Échec final (après retries) — incrémenter ici pour éviter le double-comptage
        state.pagesFailed++
        consecutiveFailures++

        if (result.error?.message.includes('BAN_DETECTED')) {
          console.error(`[Crawler] BANNISSEMENT DÉTECTÉ pour ${sourceName}: ${result.error.message}`)
          pushError(state, result.url, `BANNISSEMENT: ${result.error.message}`)
          state.status = 'banned'
          break
        }

        pushError(state, result.url, result.error?.message || 'Erreur inconnue')
        console.error(`[Crawler] Erreur page ${result.url}:`, result.error?.message || 'Erreur inconnue')

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          console.error(`[Crawler] ${MAX_CONSECUTIVE_FAILURES} échecs consécutifs, arrêt du crawl`)
          state.status = 'failed'
          break
        }
      }
    }

    // Vérifier si le batch a causé un arrêt
    if (state.status === 'banned' || state.status === 'failed') break

    // Log de progression périodique
    const shouldLog = state.pagesProcessed > 0 &&
      (state.pagesProcessed % PROGRESS_LOG_INTERVAL < filteredBatch.length ||
       state.pagesProcessed <= PROGRESS_LOG_INTERVAL)
    if (shouldLog) {
      const elapsed = ((Date.now() - crawlStartTime) / 1000).toFixed(0)
      const rate = (state.pagesProcessed / (Date.now() - crawlStartTime) * 60000).toFixed(1)
      console.log(
        `[Crawler] Progression: ${state.pagesProcessed} pages (${state.pagesNew} new, ${state.pagesFailed} err) | ` +
        `Queue: ${state.queue.length} | Visité: ${state.visited.size} | ${elapsed}s | ${rate} pages/min`
      )
    }

    // Rate limiting par batch (pas par page individuelle)
    if (effectiveRateLimit > 0 && state.queue.length > 0) {
      const randomDelay = getRandomDelay(effectiveRateLimit, 0.2) // ±20%

      // Occasionnellement ajouter une pause plus longue (simulation lecture humaine)
      if (shouldAddLongPause(0.05)) { // 5% du temps
        const longPause = getRandomDelay(5000, 0.3)
        console.log(`[Crawler] Pause longue: ${longPause}ms`)
        await sleep(longPause)
      } else {
        await sleep(randomDelay)
      }
    }
  }

  } finally {
    // Nettoyer les listeners (garanti même en cas d'exception)
    process.removeListener('SIGINT', onShutdown)
    process.removeListener('SIGTERM', onShutdown)
  }

  // Mettre à jour le statut final
  if (state.status === 'running') {
    state.status = shutdownRequested
      ? 'completed'
      : (state.pagesProcessed === 0 && state.pagesFailed === 0)
        ? 'completed'
        : state.pagesFailed < state.pagesProcessed / 2 ? 'completed' : 'failed'
  }

  const durationSec = ((Date.now() - crawlStartTime) / 1000).toFixed(1)

  // Crawl incrémental sans nouvelles pages = succès normal (rien à mettre à jour)
  const isEmptyIncremental = incrementalMode && state.pagesProcessed === 0 && state.pagesFailed === 0

  const statusMessage = state.status === 'banned'
    ? `INTERROMPU (bannissement détecté)`
    : shutdownRequested
      ? `ARRÊT GRACIEUX après ${state.pagesProcessed} pages en ${durationSec}s`
      : isEmptyIncremental
        ? `Aucune page nouvelle à crawler (incrémental, ${durationSec}s)`
        : `Terminé: ${state.pagesProcessed} pages, ${state.pagesNew} nouvelles, ${state.pagesChanged} modifiées, ${state.pagesFailed} erreurs en ${durationSec}s`

  console.log(`[Crawler] ${statusMessage}`)

  return {
    success: isEmptyIncremental || (state.status === 'completed' && (state.pagesProcessed === 0 || state.pagesFailed < state.pagesProcessed / 2)),
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
  options: { downloadFiles: boolean; incrementalMode: boolean; isSeedUrl?: boolean }
): Promise<{ success: boolean; links?: string[]; fetchResult?: import('./types').FetchResult }> {
  // Support snake_case (DB) et camelCase (types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceId = s.id
  const sourceUserAgent = s.userAgent ?? s.user_agent ?? 'QadhyaBot/1.0'

  const urlHash = hashUrl(url)

  // Vérifier si la page existe déjà
  const existingPage = await getPageByUrlHash(sourceId, urlHash)

  // Smart skip: pour les pages non-seed existantes, vérifier via HEAD si changement
  // En full_crawl, les seed URLs sont toujours traitées (pour découvrir les liens)
  // En mode incrémental, toutes les pages existantes non-seed sont vérifiées
  if (existingPage && !options.isSeedUrl) {
    const changeCheck = await checkForChanges(url, {
      etag: existingPage.etag || undefined,
      lastModified: existingPage.lastModified || undefined,
      userAgent: sourceUserAgent,
    })

    if (!changeCheck.changed) {
      console.log(`[Crawler] ⚡ Skip (inchangée): ${url}`)
      await updatePageStatus(existingPage.id, 'unchanged')
      return { success: true, links: [] }
    }
  }

  // Scraper la page
  // Optimisation: les pages non-seed (articles) utilisent le mode auto-adaptatif
  // (fetch statique ~200ms d'abord, Playwright ~8s seulement si nécessaire)
  // Les seed URLs gardent requiresJavascript pour la découverte de liens via Livewire
  const effectiveSource = options.isSeedUrl ? source : {
    ...source,
    requiresJavascript: false, // Force le fetch statique (articles SSR par Laravel)
    requires_javascript: false,
  }
  const scrapeStartTime = Date.now()
  const scrapeResult = await scrapeUrl(url, effectiveSource as WebSource)
  const scrapeTimeMs = Date.now() - scrapeStartTime

  if (!scrapeResult.success || !scrapeResult.content) {
    // Enregistrer métrique d'échec
    const statusCode = scrapeResult.fetchResult?.statusCode
    const isBanDetection = scrapeResult.error?.includes('BAN_DETECTED') || false

    await recordCrawlMetric(sourceId, false, statusCode, scrapeTimeMs, isBanDetection).catch(err =>
      console.error('[Crawler] Erreur enregistrement métrique échec:', err)
    )

    // Si bannissement détecté, marquer la source
    if (isBanDetection) {
      await markSourceAsBanned(
        sourceId,
        scrapeResult.error || 'Bannissement détecté',
        'high',
        7200000 // 2 heures
      ).catch(err => console.error('[Crawler] Erreur marquage ban:', err))
    }

    if (existingPage) {
      await updatePageError(existingPage.id, scrapeResult.error || 'Erreur scraping')
    }
    // NB: pagesFailed est incrémenté dans la boucle batch (pas ici)
    // pour éviter le double-comptage lors des retries via withRetry
    throw new Error(scrapeResult.error || 'Erreur scraping')
  }

  // Enregistrer métrique de succès
  await recordCrawlMetric(
    sourceId,
    true,
    scrapeResult.fetchResult?.statusCode || 200,
    scrapeTimeMs,
    false
  ).catch(err => console.error('[Crawler] Erreur enregistrement métrique succès:', err))

  const content = scrapeResult.content
  const contentHash = hashContent(content.content)

  // Vérifier si le contenu a vraiment changé
  if (existingPage && existingPage.contentHash === contentHash) {
    // Vérifier si des fichiers existants n'ont pas encore été téléchargés
    const existingFiles = existingPage.linkedFiles || []
    const hasUndownloadedFiles = options.downloadFiles
      && existingFiles.length > 0
      && existingFiles.some((f: LinkedFile) => !f.downloaded || !f.minioPath)
    const sourceAutoIndex = s.autoIndexFiles ?? s.auto_index_files ?? false

    if (hasUndownloadedFiles) {
      const pendingFiles = existingFiles.filter((f: LinkedFile) => !f.downloaded || !f.minioPath)
      console.log(`[Crawler] Contenu identique, ${pendingFiles.length} fichier(s) à télécharger: ${url}`)
      const downloadedFiles = await downloadLinkedFiles(source, pendingFiles)
      const newlyDownloaded = downloadedFiles.filter(f => f.downloaded)
      state.filesDownloaded += newlyDownloaded.length

      // Fusionner les fichiers téléchargés avec les existants
      const mergedFiles = existingFiles.map((ef: LinkedFile) => {
        const updated = downloadedFiles.find(df => df.url === ef.url)
        return updated && updated.downloaded ? updated : ef
      })
      await updatePageFiles(existingPage.id, mergedFiles)

      // Auto-indexation si activée
      if (sourceAutoIndex && newlyDownloaded.length > 0) {
        const sourceCategory = s.category || 'autre'
        const sName = s.name || 'Unknown'
        await autoIndexFilesForPage(existingPage.id, newlyDownloaded, sourceId, sName, sourceCategory)
      }
    } else {
      console.log(`[Crawler] Contenu identique: ${url}`)
    }

    await updatePageTimestamp(existingPage.id, scrapeResult.fetchResult)
    return { success: true, links: content.links, fetchResult: scrapeResult.fetchResult }
  }

  // Télécharger les fichiers liés si demandé
  let downloadedFiles: LinkedFile[] = content.files
  if (options.downloadFiles && content.files.length > 0) {
    downloadedFiles = await downloadLinkedFiles(source, content.files)
    state.filesDownloaded += downloadedFiles.filter(f => f.downloaded).length
  }

  // Sauvegarder ou mettre à jour la page
  let savedPageId: string
  if (existingPage) {
    await updatePage(existingPage.id, {
      content,
      contentHash,
      files: downloadedFiles,
      fetchResult: scrapeResult.fetchResult,
    })
    savedPageId = existingPage.id
    state.pagesChanged++
    console.log(`[Crawler] Page mise à jour: ${url}`)
  } else {
    savedPageId = await insertPage(sourceId, url, urlHash, depth, {
      content,
      contentHash,
      files: downloadedFiles,
      fetchResult: scrapeResult.fetchResult,
    })
    state.pagesNew++
    console.log(`[Crawler] Nouvelle page: ${url}`)
  }

  // Auto-indexation des fichiers si activée (D3)
  const sourceAutoIndex = s.autoIndexFiles ?? s.auto_index_files ?? false
  if (sourceAutoIndex && savedPageId && downloadedFiles.length > 0) {
    const sourceCategory = s.category || 'autre'
    const sName = s.name || 'Unknown'
    await autoIndexFilesForPage(savedPageId, downloadedFiles, sourceId, sName, sourceCategory)
  }

  return { success: true, links: content.links, fetchResult: scrapeResult.fetchResult }
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
  const allowedPdfDomains: string[] = s.allowedPdfDomains ?? s.allowed_pdf_domains ?? []

  const result: LinkedFile[] = []

  for (const file of files) {
    // Ne pas re-télécharger si déjà fait
    if (file.downloaded) {
      result.push(file)
      continue
    }

    // Filtrer par whitelist de domaines (si configurée)
    if (allowedPdfDomains.length > 0) {
      try {
        const fileHost = new URL(file.url).hostname
        const isAllowed = allowedPdfDomains.some(
          d => fileHost === d || fileHost.endsWith('.' + d)
        )
        if (!isAllowed) {
          console.log(`[Crawler] PDF ignoré (domaine non autorisé): ${fileHost} → ${file.url}`)
          result.push({ ...file, downloaded: false })
          continue
        }
      } catch {
        result.push({ ...file, downloaded: false })
        continue
      }
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
          WEB_FILES_BUCKET
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
// CRAWL DE FORMULAIRES (POST CSRF)
// =============================================================================

/**
 * Crawle les résultats d'un formulaire POST (ex: TYPO3 cassation.tn)
 * Soumet le formulaire pour chaque thème et collecte les liens de détail
 */
async function crawlFormResults(
  config: FormCrawlConfig,
  pageUrl: string,
  ignoreSSLErrors: boolean,
  rateLimitMs: number,
): Promise<string[]> {
  if (config.type === 'webdev-iort') {
    console.log('[Crawler] Type webdev-iort: utiliser scripts/crawl-iort.ts pour le crawl IORT')
    return []
  }

  if (config.type !== 'typo3-cassation') {
    console.warn(`[Crawler] Type de formulaire inconnu: ${config.type}`)
    return []
  }

  const { extractCsrfTokens, buildSearchPostBody, CASSATION_THEMES } = await import('./typo3-csrf-utils')
  const cheerio = await import('cheerio')

  // Étape 1: Extraire les tokens CSRF
  const csrfResult = await extractCsrfTokens(pageUrl, { ignoreSSLErrors })
  if (!csrfResult) {
    console.warn(`[Crawler] Impossible d'extraire les tokens CSRF depuis ${pageUrl}`)
    return []
  }

  const { tokens } = csrfResult
  const allLinks: string[] = []

  // Déterminer les thèmes à crawler
  const themeCodes = config.themes || Object.keys(CASSATION_THEMES)

  console.log(`[Crawler] Formulaire TYPO3: ${themeCodes.length} thèmes à crawler`)

  for (const themeCode of themeCodes) {
    try {
      // Construire le body POST pour ce thème
      const body = buildSearchPostBody(tokens, { theme: themeCode })

      // POST de recherche
      const result = await fetchHtml(tokens.formAction, {
        method: 'POST',
        body,
        ignoreSSLErrors,
        stealthMode: true,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ar,fr;q=0.9,en;q=0.8',
          'Referer': pageUrl,
          'Origin': new URL(pageUrl).origin,
        },
      })

      if (!result.success || !result.html) {
        console.warn(`[Crawler] Échec POST thème ${themeCode}: ${result.error}`)
        continue
      }

      // Parser les résultats
      const $ = cheerio.load(result.html)
      const baseOrigin = new URL(pageUrl).origin

      // Extraire les liens de détail dans le conteneur de résultats
      $('.tx-upload-example a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return

        const absoluteUrl = href.startsWith('http')
          ? href
          : `${baseOrigin}${href.startsWith('/') ? '' : '/'}${href}`

        // Exclure les liens externes, les ancres et les PDFs
        if (
          absoluteUrl.startsWith(baseOrigin) &&
          !absoluteUrl.includes('#') &&
          !absoluteUrl.toLowerCase().endsWith('.pdf')
        ) {
          allLinks.push(absoluteUrl)
        }
      })

      // NOTE: On ne collecte PAS les liens PDF ici.
      // Les PDFs seront découverts naturellement quand processPage()
      // crawlera les pages de détail, et downloadLinkedFiles() les gérera.

      const themeName = CASSATION_THEMES[themeCode]?.fr || themeCode
      const themeIdx = themeCodes.indexOf(themeCode) + 1
      console.log(`[Crawler] Thème ${themeIdx}/${themeCodes.length} "${themeName}": ${allLinks.length} liens cumulés`)

    } catch (themeError) {
      console.error(`[Crawler] Erreur thème ${themeCode}:`, themeError instanceof Error ? themeError.message : themeError)
    }

    // Rate limiting entre chaque POST
    if (rateLimitMs > 0) {
      await sleep(rateLimitMs)
    }
  }

  // Dédupliquer les liens
  const uniqueLinks = [...new Set(allLinks)]
  console.log(`[Crawler] Formulaire: ${uniqueLinks.length} liens uniques découverts (total brut: ${allLinks.length})`)

  return uniqueLinks
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
 * Insère une nouvelle page et retourne son ID
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
): Promise<string> {
  const { content, contentHash, files, fetchResult } = data

  const insertResult = await db.query(
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
    ) RETURNING id`,
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

  const pageId = insertResult.rows[0]?.id as string

  // Créer la version initiale
  if (pageId) {
    try {
      const { createWebPageVersion } = await import('./source-service')
      await createWebPageVersion(pageId, 'initial_crawl')
    } catch (err) {
      console.error('[Crawler] Erreur création version initiale:', err)
    }
  }

  return pageId
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

  // Créer un snapshot de l'état actuel AVANT la mise à jour
  try {
    const { createWebPageVersion } = await import('./source-service')
    await createWebPageVersion(pageId, 'content_change')
  } catch (err) {
    console.error('[Crawler] Erreur création version:', err)
  }

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
 * Met à jour les fichiers liés d'une page existante
 */
async function updatePageFiles(pageId: string, files: LinkedFile[]): Promise<void> {
  await db.query(
    `UPDATE web_pages SET linked_files = $2, updated_at = NOW() WHERE id = $1`,
    [pageId, JSON.stringify(files)]
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
// AUTO-INDEXATION DES FICHIERS (D3)
// =============================================================================

/**
 * Indexe automatiquement les fichiers téléchargés d'une page
 * Ne bloque JAMAIS le crawl en cas d'erreur
 */
async function autoIndexFilesForPage(
  pageId: string,
  files: LinkedFile[],
  sourceId: string,
  sourceName: string,
  category: string
): Promise<void> {
  const downloadedFiles = files.filter(f => f.downloaded && f.minioPath)
  if (downloadedFiles.length === 0) return

  try {
    const { indexFile } = await import('./file-indexer-service')
    for (const file of downloadedFiles) {
      try {
        const result = await indexFile(file, pageId, sourceId, sourceName, category)
        if (result.success) {
          console.log(`[Crawler] Auto-indexé: ${file.filename} (${result.chunksCreated} chunks)`)
        } else {
          console.warn(`[Crawler] Échec auto-indexation ${file.filename}: ${result.error}`)
        }
      } catch (err) {
        console.error(`[Crawler] Erreur auto-indexation ${file.filename}:`, err)
      }
    }
  } catch (err) {
    console.error('[Crawler] Erreur import file-indexer-service:', err)
  }
}

// =============================================================================
// UTILITAIRES
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Ajoute une erreur au state en limitant la taille du tableau
 */
function pushError(state: CrawlState, url: string, error: string): void {
  if (state.errors.length < MAX_ERRORS_KEPT) {
    state.errors.push({ url, error, timestamp: new Date().toISOString() })
  } else if (state.errors.length === MAX_ERRORS_KEPT) {
    state.errors.push({
      url: '',
      error: `... erreurs tronquées après ${MAX_ERRORS_KEPT} entrées`,
      timestamp: new Date().toISOString(),
    })
  }
  // Au-delà de MAX_ERRORS_KEPT+1, on ne stocke plus (évite OOM)
}

/**
 * Crawle une seule page
 */
export interface ScrapeUrlListOptions {
  /** Concurrence max (défaut: 5) */
  concurrency?: number
  /** Délai entre requêtes en ms (défaut: rateLimitMs de la source) */
  rateLimitMs?: number
  /** Indexer automatiquement après scrape (si autoIndexFiles actif) */
  indexAfterScrape?: boolean
  /** Télécharger les fichiers liés (PDFs, DOCX) */
  downloadFiles?: boolean
}

export interface ScrapeUrlListResult {
  success: boolean
  pagesProcessed: number
  pagesNew: number
  pagesUpdated: number
  pagesFailed: number
  filesDownloaded: number
  errors: CrawlError[]
}

/**
 * Scrape une liste d'URLs connues sans crawler (pas de découverte de liens)
 * Utile pour : re-indexer des pages spécifiques, importer des listes JORT,
 * traiter des URLs manuelles
 */
export async function scrapeUrlList(
  source: WebSource,
  urls: string[],
  options: ScrapeUrlListOptions = {}
): Promise<ScrapeUrlListResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = source as any
  const sourceId = s.id
  const sourceName = s.name
  const sourceRateLimit = s.rateLimitMs ?? s.rate_limit_ms ?? 1000
  const sourceDownloadFiles = options.downloadFiles ?? (s.downloadFiles ?? s.download_files ?? false)
  const sourceAutoIndex = options.indexAfterScrape ?? (s.autoIndexFiles ?? s.auto_index_files ?? false)
  const sourceCategory = s.category || 'autre'

  const {
    concurrency = 5,
    rateLimitMs = sourceRateLimit,
  } = options

  // Dédupliquer les URLs
  const uniqueUrls = [...new Set(urls)]

  console.log(`[Crawler] scrapeUrlList: ${uniqueUrls.length} URLs à traiter (concurrence: ${concurrency})`)

  const result: ScrapeUrlListResult = {
    success: true,
    pagesProcessed: 0,
    pagesNew: 0,
    pagesUpdated: 0,
    pagesFailed: 0,
    filesDownloaded: 0,
    errors: [],
  }

  // Traiter par batch
  for (let i = 0; i < uniqueUrls.length; i += concurrency) {
    const batch = uniqueUrls.slice(i, i + concurrency)

    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        try {
          const scrapeResult = await scrapeUrl(url, source)

          if (!scrapeResult.success || !scrapeResult.content) {
            return { url, success: false, error: scrapeResult.error || 'Erreur scraping', isNew: false }
          }

          const content = scrapeResult.content
          const urlHash = hashUrl(url)
          const contentHash = hashContent(content.content)

          // Télécharger les fichiers liés si demandé
          let downloadedFiles = content.files
          let filesDownloaded = 0
          if (sourceDownloadFiles && content.files.length > 0) {
            downloadedFiles = await downloadLinkedFiles(source, content.files)
            filesDownloaded = downloadedFiles.filter(f => f.downloaded).length
          }

          // Sauvegarder ou mettre à jour la page
          const existingPage = await getPageByUrlHash(sourceId, urlHash)
          let savedPageId: string
          let isNew = false

          if (existingPage) {
            await updatePage(existingPage.id, {
              content,
              contentHash,
              files: downloadedFiles,
              fetchResult: scrapeResult.fetchResult,
            })
            savedPageId = existingPage.id
          } else {
            savedPageId = await insertPage(sourceId, url, urlHash, 0, {
              content,
              contentHash,
              files: downloadedFiles,
              fetchResult: scrapeResult.fetchResult,
            })
            isNew = true
          }

          // Auto-indexation des fichiers si activée
          if (sourceAutoIndex && savedPageId && downloadedFiles.length > 0) {
            await autoIndexFilesForPage(savedPageId, downloadedFiles, sourceId, sourceName, sourceCategory)
          }

          return { url, success: true, isNew, filesDownloaded }
        } catch (error) {
          return {
            url,
            success: false,
            error: error instanceof Error ? error.message : 'Erreur inconnue',
            isNew: false,
          }
        }
      })
    )

    // Comptabiliser les résultats du batch
    for (const settled of batchResults) {
      const r = settled.status === 'fulfilled'
        ? settled.value
        : { url: 'unknown', success: false, error: String(settled.reason), isNew: false, filesDownloaded: 0 }

      result.pagesProcessed++
      if (r.success) {
        if (r.isNew) result.pagesNew++
        else result.pagesUpdated++
        result.filesDownloaded += (r as { filesDownloaded?: number }).filesDownloaded || 0
      } else {
        result.pagesFailed++
        pushError(
          { errors: result.errors } as CrawlState,
          r.url,
          r.error || 'Erreur inconnue'
        )
      }
    }

    // Log de progression
    if (result.pagesProcessed % 10 === 0 || i + concurrency >= uniqueUrls.length) {
      console.log(
        `[Crawler] scrapeUrlList: ${result.pagesProcessed}/${uniqueUrls.length} ` +
        `(${result.pagesNew} new, ${result.pagesUpdated} updated, ${result.pagesFailed} failed)`
      )
    }

    // Rate limiting entre batches
    if (rateLimitMs > 0 && i + concurrency < uniqueUrls.length) {
      await sleep(rateLimitMs)
    }
  }

  result.success = result.pagesFailed < result.pagesProcessed / 2

  console.log(
    `[Crawler] scrapeUrlList terminé: ${result.pagesProcessed} pages ` +
    `(${result.pagesNew} new, ${result.pagesUpdated} updated, ${result.pagesFailed} failed, ${result.filesDownloaded} files)`
  )

  return result
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
