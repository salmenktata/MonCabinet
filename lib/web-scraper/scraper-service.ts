/**
 * Service de scraping web
 * Supporte les sites statiques (fetch + cheerio) et dynamiques (Playwright)
 */

import type { WebSource, ScrapedContent } from './types'
import { extractContent, hashUrl, hashContent } from './content-extractor'
import { isUrlAllowed } from './robots-parser'

// Timeout par défaut
const DEFAULT_TIMEOUT_MS = 30000

// User-Agent par défaut
const DEFAULT_USER_AGENT = 'QadhyaBot/1.0 (+https://qadhya.tn/bot)'

interface FetchOptions {
  userAgent?: string
  timeout?: number
  headers?: Record<string, string>
  respectRobotsTxt?: boolean
}

interface FetchResult {
  success: boolean
  html?: string
  statusCode?: number
  error?: string
  finalUrl?: string
  etag?: string
  lastModified?: Date | null
}

/**
 * Récupère le contenu HTML d'une URL (statique)
 */
export async function fetchHtml(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT_MS,
    headers = {},
    respectRobotsTxt = true,
  } = options

  // Vérifier robots.txt si demandé
  if (respectRobotsTxt) {
    const robotsCheck = await isUrlAllowed(url, userAgent)
    if (!robotsCheck.allowed) {
      return {
        success: false,
        error: 'URL bloquée par robots.txt',
        statusCode: 403,
      }
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,ar;q=0.8,en;q=0.7',
        ...headers,
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    // Vérifier le type de contenu
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return {
        success: false,
        error: `Type de contenu non HTML: ${contentType}`,
        statusCode: response.status,
      }
    }

    const html = await response.text()

    // Récupérer les headers de cache
    const etag = response.headers.get('etag') || undefined
    const lastModifiedStr = response.headers.get('last-modified')
    const lastModified = lastModifiedStr ? new Date(lastModifiedStr) : null

    return {
      success: true,
      html,
      statusCode: response.status,
      finalUrl: response.url,
      etag,
      lastModified,
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: `Timeout après ${timeout}ms`,
        }
      }
      return {
        success: false,
        error: error.message,
      }
    }
    return {
      success: false,
      error: 'Erreur inconnue',
    }
  }
}

/**
 * Récupère le contenu HTML d'une URL dynamique (Playwright)
 * Nécessite Playwright installé
 */
export async function fetchHtmlDynamic(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = DEFAULT_TIMEOUT_MS,
    headers = {},
    respectRobotsTxt = true,
  } = options

  // Vérifier robots.txt si demandé
  if (respectRobotsTxt) {
    const robotsCheck = await isUrlAllowed(url, userAgent)
    if (!robotsCheck.allowed) {
      return {
        success: false,
        error: 'URL bloquée par robots.txt',
        statusCode: 403,
      }
    }
  }

  try {
    // Import dynamique de Playwright pour éviter l'erreur si non installé
    const { chromium } = await import('playwright')

    const browser = await chromium.launch({
      headless: true,
    })

    try {
      const context = await browser.newContext({
        userAgent,
        extraHTTPHeaders: headers,
      })

      const page = await context.newPage()

      // Naviguer vers l'URL
      const response = await page.goto(url, {
        timeout,
        waitUntil: 'networkidle',
      })

      if (!response) {
        return {
          success: false,
          error: 'Pas de réponse du serveur',
        }
      }

      if (!response.ok()) {
        return {
          success: false,
          statusCode: response.status(),
          error: `HTTP ${response.status()}: ${response.statusText()}`,
        }
      }

      // Attendre que le contenu soit chargé
      await page.waitForLoadState('domcontentloaded')

      // Récupérer le HTML rendu
      const html = await page.content()
      const finalUrl = page.url()

      // Headers de cache
      const responseHeaders = response.headers()
      const etag = responseHeaders['etag'] || undefined
      const lastModifiedStr = responseHeaders['last-modified']
      const lastModified = lastModifiedStr ? new Date(lastModifiedStr) : null

      await context.close()

      return {
        success: true,
        html,
        statusCode: response.status(),
        finalUrl,
        etag,
        lastModified,
      }

    } finally {
      await browser.close()
    }

  } catch (error) {
    // Si Playwright n'est pas installé, on suggère de l'installer
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      return {
        success: false,
        error: 'Playwright non installé. Exécutez: pnpm add playwright && npx playwright install chromium',
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('Timeout')) {
        return {
          success: false,
          error: `Timeout après ${timeout}ms`,
        }
      }
      return {
        success: false,
        error: error.message,
      }
    }

    return {
      success: false,
      error: 'Erreur inconnue',
    }
  }
}

/**
 * Scrape une URL et extrait le contenu
 */
export async function scrapeUrl(
  url: string,
  source: Partial<WebSource>
): Promise<{ success: boolean; content?: ScrapedContent; error?: string; fetchResult?: FetchResult }> {

  const fetchOptions: FetchOptions = {
    userAgent: source.userAgent || DEFAULT_USER_AGENT,
    timeout: source.timeoutMs || DEFAULT_TIMEOUT_MS,
    headers: source.customHeaders || {},
    respectRobotsTxt: source.respectRobotsTxt !== false,
  }

  // Choisir la méthode de fetch
  const fetchResult = source.requiresJavascript
    ? await fetchHtmlDynamic(url, fetchOptions)
    : await fetchHtml(url, fetchOptions)

  if (!fetchResult.success || !fetchResult.html) {
    return {
      success: false,
      error: fetchResult.error,
      fetchResult,
    }
  }

  try {
    // Extraire le contenu
    const content = extractContent(
      fetchResult.html,
      fetchResult.finalUrl || url,
      source.cssSelectors
    )

    return {
      success: true,
      content,
      fetchResult,
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur extraction contenu',
      fetchResult,
    }
  }
}

/**
 * Vérifie si une page a changé sans télécharger le contenu complet
 * Utilise les headers ETag et Last-Modified
 */
export async function checkForChanges(
  url: string,
  options: {
    etag?: string
    lastModified?: Date
    userAgent?: string
    timeout?: number
  } = {}
): Promise<{
  changed: boolean
  newEtag?: string
  newLastModified?: Date
  error?: string
}> {
  const {
    etag,
    lastModified,
    userAgent = DEFAULT_USER_AGENT,
    timeout = 10000,
  } = options

  try {
    const headers: Record<string, string> = {
      'User-Agent': userAgent,
    }

    if (etag) {
      headers['If-None-Match'] = etag
    }

    if (lastModified) {
      headers['If-Modified-Since'] = lastModified.toUTCString()
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'HEAD',
      headers,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    // 304 Not Modified = pas de changement
    if (response.status === 304) {
      return { changed: false }
    }

    // Récupérer les nouveaux headers
    const newEtag = response.headers.get('etag') || undefined
    const newLastModifiedStr = response.headers.get('last-modified')
    const newLastModified = newLastModifiedStr ? new Date(newLastModifiedStr) : undefined

    // Si on a les mêmes valeurs, pas de changement
    if (etag && newEtag && etag === newEtag) {
      return { changed: false, newEtag }
    }

    if (lastModified && newLastModified && lastModified >= newLastModified) {
      return { changed: false, newLastModified }
    }

    return {
      changed: true,
      newEtag,
      newLastModified,
    }

  } catch (error) {
    return {
      changed: true, // En cas d'erreur, on suppose qu'il y a eu un changement
      error: error instanceof Error ? error.message : 'Erreur vérification',
    }
  }
}

/**
 * Télécharge un fichier (PDF, DOCX, etc.)
 */
export async function downloadFile(
  url: string,
  options: {
    userAgent?: string
    timeout?: number
    maxSize?: number
  } = {}
): Promise<{
  success: boolean
  buffer?: Buffer
  contentType?: string
  size?: number
  error?: string
}> {
  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = 60000,
    maxSize = 50 * 1024 * 1024, // 50 MB par défaut
  } = options

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    // Vérifier la taille
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > maxSize) {
      return {
        success: false,
        error: `Fichier trop volumineux: ${parseInt(contentLength)} bytes (max: ${maxSize})`,
      }
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Vérifier la taille finale
    if (buffer.length > maxSize) {
      return {
        success: false,
        error: `Fichier trop volumineux: ${buffer.length} bytes (max: ${maxSize})`,
      }
    }

    return {
      success: true,
      buffer,
      contentType: response.headers.get('content-type') || undefined,
      size: buffer.length,
    }

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        success: false,
        error: `Timeout après ${timeout}ms`,
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur téléchargement',
    }
  }
}

/**
 * Génère les identifiants pour une page
 */
export function generatePageIds(url: string, content: string): {
  urlHash: string
  contentHash: string
} {
  return {
    urlHash: hashUrl(url),
    contentHash: hashContent(content),
  }
}
