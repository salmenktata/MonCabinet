/**
 * Détection et parsing automatique des sitemaps
 * Aucune configuration manuelle requise
 */

import { parseStringPromise } from 'xml2js'
import { fetchHtml } from './scraper-service'

/**
 * Fetch simple pour texte brut (robots.txt, sitemap.xml)
 */
async function fetchText(url: string): Promise<{ success: boolean; text: string }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'QadhyaBot/1.0 (+https://qadhya.tn/bot)',
      },
      // @ts-ignore - Node.js fetch options
      rejectUnauthorized: false, // Ignore SSL errors
    })

    if (!response.ok) {
      return { success: false, text: '' }
    }

    const text = await response.text()
    return { success: true, text }
  } catch (error) {
    return { success: false, text: '' }
  }
}

export interface SitemapDetectionResult {
  hasSitemap: boolean
  sitemapUrls: string[] // URLs des sitemaps trouvés
  pageUrls: string[] // URLs des pages extraites
  totalPages: number
}

/**
 * Chemins standards de sitemap à tester
 */
const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/wp-sitemap.xml', // WordPress
  '/sitemap1.xml',
  '/post-sitemap.xml',
  '/page-sitemap.xml',
]

/**
 * Détecte et extrait automatiquement les URLs d'un sitemap
 */
export async function detectAndParseSitemap(
  baseUrl: string
): Promise<SitemapDetectionResult> {
  const result: SitemapDetectionResult = {
    hasSitemap: false,
    sitemapUrls: [],
    pageUrls: [],
    totalPages: 0,
  }

  // Normaliser baseUrl
  const normalizedBase = baseUrl.replace(/\/$/, '')

  // 1. Essayer de détecter via robots.txt
  const robotsSitemaps = await detectSitemapFromRobots(normalizedBase)
  if (robotsSitemaps.length > 0) {
    console.log(`[SitemapDetector] Trouvé ${robotsSitemaps.length} sitemap(s) dans robots.txt`)
    result.sitemapUrls.push(...robotsSitemaps)
  }

  // 2. Essayer les chemins standards
  if (result.sitemapUrls.length === 0) {
    console.log(`[SitemapDetector] Test des chemins standards...`)
    for (const path of SITEMAP_PATHS) {
      const sitemapUrl = `${normalizedBase}${path}`
      const exists = await testSitemapUrl(sitemapUrl)
      if (exists) {
        console.log(`[SitemapDetector] ✓ Trouvé: ${sitemapUrl}`)
        result.sitemapUrls.push(sitemapUrl)
        break // Premier trouvé suffit
      }
    }
  }

  // 3. Si aucun sitemap trouvé
  if (result.sitemapUrls.length === 0) {
    console.log(`[SitemapDetector] Aucun sitemap détecté pour ${baseUrl}`)
    return result
  }

  result.hasSitemap = true

  // 4. Parser tous les sitemaps trouvés
  const allUrls = new Set<string>()
  for (const sitemapUrl of result.sitemapUrls) {
    const urls = await parseSitemapRecursive(sitemapUrl)
    urls.forEach(url => allUrls.add(url))
  }

  result.pageUrls = Array.from(allUrls)
  result.totalPages = result.pageUrls.length

  console.log(`[SitemapDetector] ✓ ${result.totalPages} URLs extraites du sitemap`)

  return result
}

/**
 * Détecte les sitemaps déclarés dans robots.txt
 */
async function detectSitemapFromRobots(baseUrl: string): Promise<string[]> {
  try {
    const robotsUrl = `${baseUrl}/robots.txt`
    console.log(`[SitemapDetector] Lecture de ${robotsUrl}...`)
    const response = await fetchText(robotsUrl)

    console.log(`[SitemapDetector] Response success: ${response.success}, text length: ${response.text?.length || 0}`)

    if (!response.success || !response.text) {
      console.log(`[SitemapDetector] Aucun robots.txt trouvé`)
      return []
    }

    // Extraire les lignes "Sitemap: ..."
    const sitemaps: string[] = []
    const lines = response.text.split('\n')

    for (const line of lines) {
      const match = line.match(/^Sitemap:\s*(.+)$/i)
      if (match) {
        const sitemapUrl = match[1].trim()
        console.log(`[SitemapDetector] ✓ Sitemap trouvé dans robots.txt: ${sitemapUrl}`)
        sitemaps.push(sitemapUrl)
      }
    }

    if (sitemaps.length === 0) {
      console.log(`[SitemapDetector] Aucune directive Sitemap dans robots.txt`)
    }

    return sitemaps
  } catch (error) {
    console.error(`[SitemapDetector] Erreur lecture robots.txt:`, error)
    return []
  }
}

/**
 * Teste si une URL de sitemap existe
 */
async function testSitemapUrl(url: string): Promise<boolean> {
  try {
    const response = await fetchText(url)

    if (!response.success || !response.text) {
      return false
    }

    // Vérifier que c'est bien du XML
    return response.text.includes('<?xml') &&
           (response.text.includes('<urlset') || response.text.includes('<sitemapindex'))
  } catch (error) {
    return false
  }
}

/**
 * Parse récursivement un sitemap (gère les sitemap index)
 */
async function parseSitemapRecursive(
  sitemapUrl: string,
  visitedSitemaps = new Set<string>()
): Promise<string[]> {
  // Éviter les boucles infinies
  if (visitedSitemaps.has(sitemapUrl)) {
    return []
  }
  visitedSitemaps.add(sitemapUrl)

  try {
    console.log(`[SitemapDetector] Parsing ${sitemapUrl}...`)

    const response = await fetchText(sitemapUrl)

    if (!response.success || !response.text) {
      console.warn(`[SitemapDetector] Échec de récupération: ${sitemapUrl}`)
      return []
    }

    const xml = response.text
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      ignoreAttrs: true,
    })

    const urls: string[] = []

    // Cas 1: Sitemap Index (contient d'autres sitemaps)
    if (parsed.sitemapindex?.sitemap) {
      const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap]

      console.log(`[SitemapDetector] Sitemap index trouvé avec ${sitemaps.length} sous-sitemaps`)

      for (const sitemap of sitemaps) {
        const subSitemapUrl = sitemap.loc
        if (subSitemapUrl && typeof subSitemapUrl === 'string') {
          const subUrls = await parseSitemapRecursive(subSitemapUrl, visitedSitemaps)
          urls.push(...subUrls)
        }
      }
    }

    // Cas 2: Sitemap normal (contient des URLs de pages)
    if (parsed.urlset?.url) {
      const urlEntries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url]

      for (const entry of urlEntries) {
        const loc = entry.loc
        if (loc && typeof loc === 'string') {
          urls.push(loc)
        }
      }

      console.log(`[SitemapDetector] ${urls.length} URLs extraites de ${sitemapUrl}`)
    }

    return urls
  } catch (error) {
    console.error(`[SitemapDetector] Erreur parsing ${sitemapUrl}:`, error)
    return []
  }
}

/**
 * Détecte le type de CMS/plateforme depuis l'URL et le HTML
 */
export async function detectSiteType(baseUrl: string): Promise<{
  type: 'blogger' | 'wordpress' | 'typo3' | 'spa' | 'static' | 'unknown'
  confidence: number
  evidence: string[]
}> {
  const evidence: string[] = []
  let confidence = 0

  // Test 1: URL patterns
  if (baseUrl.includes('blogspot.com') || baseUrl.includes('blogger.com')) {
    evidence.push('URL contains blogspot/blogger domain')
    return { type: 'blogger', confidence: 1.0, evidence }
  }

  // Test 2: Fetch homepage et analyser HTML
  try {
    const response = await fetchHtml(baseUrl, {
      method: 'GET',
      ignoreSSLErrors: true,
      timeout: 10000
    })

    if (response.success && response.html) {
      const html = response.html.toLowerCase()

      // Blogger signatures
      if (html.includes('blogger') || html.includes('<b:skin>') || html.includes('blogspot')) {
        evidence.push('HTML contains Blogger signatures')
        confidence += 0.5
        if (confidence > 0.4) {
          return { type: 'blogger', confidence: Math.min(confidence, 1.0), evidence }
        }
      }

      // WordPress signatures
      if (html.includes('wp-content') || html.includes('wp-includes') || html.includes('wordpress')) {
        evidence.push('HTML contains WordPress signatures')
        confidence += 0.5
        if (confidence > 0.4) {
          return { type: 'wordpress', confidence: Math.min(confidence, 1.0), evidence }
        }
      }

      // TYPO3 signatures
      if (html.includes('typo3') || html.includes('index.php?id=')) {
        evidence.push('HTML contains TYPO3 signatures')
        confidence += 0.5
        if (confidence > 0.4) {
          return { type: 'typo3', confidence: Math.min(confidence, 1.0), evidence }
        }
      }

      // SPA signatures
      if (html.includes('__next_data__') || html.includes('ng-app') ||
          html.includes('livewire') || html.includes('react') || html.includes('vue')) {
        evidence.push('HTML contains SPA framework signatures')
        confidence += 0.4
        if (confidence > 0.3) {
          return { type: 'spa', confidence: Math.min(confidence, 1.0), evidence }
        }
      }

      // Static site (par défaut si simple HTML)
      evidence.push('Simple HTML structure, likely static')
      return { type: 'static', confidence: 0.3, evidence }
    }
  } catch (error) {
    console.warn(`[SiteTypeDetector] Erreur détection: ${error}`)
  }

  evidence.push('Could not determine site type')
  return { type: 'unknown', confidence: 0, evidence }
}
