/**
 * Service de scraping web
 * Supporte les sites statiques (fetch + cheerio) et dynamiques (Playwright)
 */

import type { WebSource, ScrapedContent, DynamicSiteConfig } from './types'
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
  dynamicConfig?: DynamicSiteConfig
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
 * Types de frameworks détectables
 */
type DetectedFramework =
  | 'livewire'
  | 'alpine'
  | 'react'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'htmx'
  | 'turbo'
  | 'stimulus'
  | 'jquery-ajax'
  | 'spa-generic'
  | 'static'

/**
 * Profils de configuration par framework
 */
const FRAMEWORK_PROFILES: Record<DetectedFramework, Partial<DynamicSiteConfig>> = {
  livewire: {
    waitForLoadingToDisappear: true,
    loadingIndicators: [
      '[wire\\:loading]:not([wire\\:loading\\.remove])',
      '[wire\\:loading\\.delay]',
      '.livewire-loading',
      '[wire\\:loading\\.class]',
      '[wire\\:cloak]',
      '.loading',
      '.skeleton',
    ],
    postLoadDelayMs: 4000,  // Délai plus long pour Livewire
    scrollToLoad: true,
    scrollCount: 5,  // Plus de scrolls
    waitUntil: 'networkidle',
    dynamicTimeoutMs: 25000,  // Timeout plus long
  },
  alpine: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['[x-show][x-transition]', '.loading'],
    postLoadDelayMs: 500,
    waitUntil: 'networkidle',
  },
  react: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner', '[data-loading]', '.skeleton'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    scrollCount: 2,
    waitUntil: 'networkidle',
    dynamicTimeoutMs: 10000,
  },
  vue: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.v-progress-circular', '.v-skeleton-loader', '.loading'],
    postLoadDelayMs: 600,
    scrollToLoad: true,
    waitUntil: 'networkidle',
  },
  angular: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['mat-spinner', 'mat-progress-bar', '.ng-loading'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    waitUntil: 'networkidle',
    dynamicTimeoutMs: 12000,
  },
  svelte: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner'],
    postLoadDelayMs: 400,
    waitUntil: 'networkidle',
  },
  htmx: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.htmx-request', '.htmx-indicator'],
    postLoadDelayMs: 500,
    waitUntil: 'networkidle',
  },
  turbo: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.turbo-progress-bar', '[data-turbo-progress]'],
    postLoadDelayMs: 400,
    waitUntil: 'networkidle',
  },
  stimulus: {
    postLoadDelayMs: 300,
    waitUntil: 'domcontentloaded',
  },
  'jquery-ajax': {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.ajax-loading', '#loading'],
    postLoadDelayMs: 500,
    waitUntil: 'networkidle',
  },
  'spa-generic': {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner', '.skeleton', '[data-loading]'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    scrollCount: 2,
    waitUntil: 'networkidle',
    dynamicTimeoutMs: 10000,
  },
  static: {
    postLoadDelayMs: 0,
    waitUntil: 'domcontentloaded',
  },
}

/**
 * Configuration par défaut pour les sites dynamiques
 */
const DEFAULT_DYNAMIC_CONFIG: DynamicSiteConfig = {
  waitForLoadingToDisappear: true,
  loadingIndicators: [
    // Livewire
    '[wire\\:loading]:not([wire\\:loading\\.remove])',
    '.livewire-loading',
    // Indicateurs génériques
    '.loading',
    '.spinner',
    '.skeleton',
    '[data-loading="true"]',
    '.is-loading',
  ],
  scrollToLoad: false,
  scrollCount: 3,
  postLoadDelayMs: 500,
  waitUntil: 'networkidle',
  dynamicTimeoutMs: 10000,
}

/**
 * Détecte le framework utilisé par une page
 */
async function detectFramework(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>
): Promise<DetectedFramework[]> {
  const detected: DetectedFramework[] = []

  const checks = await page.evaluate(() => {
    const html = document.documentElement.outerHTML
    const head = document.head.innerHTML
    const scripts = Array.from(document.querySelectorAll('script')).map(s => s.src + ' ' + (s.textContent || ''))

    return {
      // Livewire (Laravel)
      livewire: html.includes('wire:') || html.includes('livewire') || !!window.Livewire,
      // Alpine.js
      alpine: html.includes('x-data') || html.includes('x-show') || html.includes('x-if'),
      // React
      react: html.includes('data-reactroot') || html.includes('__NEXT_DATA__') ||
             scripts.some(s => s.includes('react')) || !!document.querySelector('[data-reactroot]'),
      // Vue
      vue: html.includes('data-v-') || scripts.some(s => s.includes('vue')) ||
           !!document.querySelector('[data-v-]'),
      // Angular
      angular: html.includes('ng-') || html.includes('_ngcontent') ||
               scripts.some(s => s.includes('angular')) || !!document.querySelector('[ng-version]'),
      // Svelte
      svelte: scripts.some(s => s.includes('svelte')) || html.includes('svelte-'),
      // HTMX
      htmx: html.includes('hx-') || scripts.some(s => s.includes('htmx')),
      // Turbo (Hotwire)
      turbo: html.includes('data-turbo') || scripts.some(s => s.includes('turbo')),
      // Stimulus
      stimulus: html.includes('data-controller') || scripts.some(s => s.includes('stimulus')),
      // jQuery avec AJAX patterns
      jqueryAjax: (scripts.some(s => s.includes('jquery')) && html.includes('ajax')) ||
                  html.includes('$.ajax') || html.includes('$.get') || html.includes('$.post'),
      // SPA générique (hashtag routing, history API patterns)
      spaGeneric: html.includes('router') || html.includes('app-root') ||
                  !!document.querySelector('#app') || !!document.querySelector('#root'),
    }
  })

  if (checks.livewire) detected.push('livewire')
  if (checks.alpine) detected.push('alpine')
  if (checks.react) detected.push('react')
  if (checks.vue) detected.push('vue')
  if (checks.angular) detected.push('angular')
  if (checks.svelte) detected.push('svelte')
  if (checks.htmx) detected.push('htmx')
  if (checks.turbo) detected.push('turbo')
  if (checks.stimulus) detected.push('stimulus')
  if (checks.jqueryAjax) detected.push('jquery-ajax')
  if (checks.spaGeneric && detected.length === 0) detected.push('spa-generic')
  if (detected.length === 0) detected.push('static')

  return detected
}

/**
 * Fusionne les profils de frameworks détectés
 */
function mergeFrameworkProfiles(frameworks: DetectedFramework[]): DynamicSiteConfig {
  let merged: DynamicSiteConfig = { ...DEFAULT_DYNAMIC_CONFIG }

  for (const framework of frameworks) {
    const profile = FRAMEWORK_PROFILES[framework]
    if (profile) {
      merged = {
        ...merged,
        ...profile,
        // Fusionner les indicateurs de chargement
        loadingIndicators: [
          ...(merged.loadingIndicators || []),
          ...(profile.loadingIndicators || []),
        ].filter((v, i, a) => a.indexOf(v) === i), // Dédupliquer
      }

      // Prendre le délai le plus long
      if (profile.postLoadDelayMs && profile.postLoadDelayMs > (merged.postLoadDelayMs || 0)) {
        merged.postLoadDelayMs = profile.postLoadDelayMs
      }

      // Prendre le timeout le plus long
      if (profile.dynamicTimeoutMs && profile.dynamicTimeoutMs > (merged.dynamicTimeoutMs || 0)) {
        merged.dynamicTimeoutMs = profile.dynamicTimeoutMs
      }
    }
  }

  return merged
}

/**
 * Récupère le contenu HTML d'une URL dynamique (Playwright)
 * Supporte les sites SPA: Livewire, React, Vue, Angular, etc.
 * Détection automatique des frameworks et adaptation du scraping
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
    dynamicConfig = {},
  } = options

  // La config sera fusionnée après détection du framework
  let config: DynamicSiteConfig = {
    ...DEFAULT_DYNAMIC_CONFIG,
    ...dynamicConfig,
  }

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
        // Viewport standard pour déclencher le contenu responsive
        viewport: { width: 1920, height: 1080 },
      })

      const page = await context.newPage()

      // Naviguer vers l'URL avec le mode d'attente configuré
      const response = await page.goto(url, {
        timeout,
        waitUntil: config.waitUntil || 'networkidle',
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

      // Détection automatique des frameworks et adaptation
      const detectedFrameworks = await detectFramework(page)
      if (detectedFrameworks.length > 0 && detectedFrameworks[0] !== 'static') {
        const adaptedConfig = mergeFrameworkProfiles(detectedFrameworks)
        // Fusionner avec la config utilisateur (priorité à l'utilisateur)
        config = {
          ...adaptedConfig,
          ...dynamicConfig,
        }
        console.log(`[Scraper] Frameworks détectés: ${detectedFrameworks.join(', ')} - Configuration adaptée`)
      }

      // Attendre un sélecteur spécifique si configuré
      if (config.waitForSelector) {
        try {
          await page.waitForSelector(config.waitForSelector, {
            timeout: config.dynamicTimeoutMs || 10000,
            state: 'visible',
          })
        } catch {
          // Log mais ne pas échouer si le sélecteur n'apparaît pas
          console.warn(`[Scraper] Selector "${config.waitForSelector}" not found after timeout`)
        }
      }

      // Attendre la disparition des indicateurs de chargement
      if (config.waitForLoadingToDisappear && config.loadingIndicators?.length) {
        await waitForLoadingIndicatorsToDisappear(page, config.loadingIndicators, config.dynamicTimeoutMs || 10000)
      }

      // Scroller la page pour déclencher le lazy loading
      if (config.scrollToLoad) {
        await scrollPageForLazyLoading(page, config.scrollCount || 3)
      }

      // Cliquer sur des éléments si configuré (ex: "Voir plus", "Charger plus")
      if (config.clickBeforeExtract?.length) {
        for (const selector of config.clickBeforeExtract) {
          try {
            const element = page.locator(selector).first()
            if (await element.isVisible()) {
              await element.click()
              // Attendre après le clic
              await page.waitForTimeout(1000)
            }
          } catch {
            // Ignorer les erreurs de clic
          }
        }
      }

      // Exécuter du JavaScript personnalisé si configuré
      if (config.customScript) {
        try {
          await page.evaluate(config.customScript)
        } catch (e) {
          console.warn('[Scraper] Custom script error:', e)
        }
      }

      // Délai supplémentaire après chargement
      if (config.postLoadDelayMs && config.postLoadDelayMs > 0) {
        await page.waitForTimeout(config.postLoadDelayMs)
      }

      // Pour Livewire: attendre que le contenu principal soit chargé
      // On attend que des éléments de contenu significatifs apparaissent
      await waitForContentToLoad(page, config.dynamicTimeoutMs || 10000)

      // Stratégie agressive pour Livewire: forcer le re-rendu
      if (detectedFrameworks.includes('livewire')) {
        await forceLivewireRerender(page)
      }

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
 * Attend que tous les indicateurs de chargement disparaissent
 */
async function waitForLoadingIndicatorsToDisappear(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
  indicators: string[],
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now()

  for (const indicator of indicators) {
    try {
      // Vérifier si l'indicateur existe
      const elements = page.locator(indicator)
      const count = await elements.count()

      if (count > 0) {
        // Attendre que l'indicateur disparaisse
        await page.waitForSelector(indicator, {
          state: 'hidden',
          timeout: Math.max(1000, timeoutMs - (Date.now() - startTime)),
        })
      }
    } catch {
      // Continuer si le timeout est atteint pour cet indicateur
    }

    // Vérifier le timeout global
    if (Date.now() - startTime > timeoutMs) {
      break
    }
  }
}

/**
 * Force le re-rendu des composants Livewire
 * Utile quand le contenu est chargé via Websocket/XHR
 */
async function forceLivewireRerender(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>
): Promise<void> {
  try {
    await page.evaluate(() => {
      // Forcer Livewire à rafraîchir tous les composants
      if (typeof (window as typeof window & { Livewire?: { rescan?: () => void; emit?: (event: string) => void } }).Livewire !== 'undefined') {
        const Livewire = (window as typeof window & { Livewire: { rescan?: () => void; emit?: (event: string) => void } }).Livewire
        if (Livewire.rescan) {
          Livewire.rescan()
        }
        // Émettre un événement de rafraîchissement
        if (Livewire.emit) {
          Livewire.emit('refresh')
        }
      }

      // Déclencher les événements de scroll pour le lazy loading
      window.dispatchEvent(new Event('scroll'))
      window.dispatchEvent(new Event('resize'))
    })

    // Attendre que Livewire traite les événements
    await page.waitForTimeout(2000)

    // Attendre la stabilisation du réseau
    try {
      await page.waitForLoadState('networkidle', { timeout: 5000 })
    } catch {
      // Ignorer le timeout
    }

    console.log('[Scraper] Livewire re-render forcé')
  } catch (e) {
    console.warn('[Scraper] Erreur lors du re-render Livewire:', e)
  }
}

/**
 * Attend que le contenu principal soit chargé
 * Vérifie que la page contient suffisamment de texte visible
 * Attend aussi la disparition des indicateurs de chargement arabes/français
 */
async function waitForContentToLoad(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
  timeoutMs: number
): Promise<void> {
  const startTime = Date.now()
  const minContentLength = 500 // Minimum de caractères attendus
  const checkInterval = 800 // Vérifier toutes les 800ms

  // Textes indicateurs de chargement en cours
  const loadingTexts = [
    'التحميل...',      // arabe: "Chargement..."
    'جاري التحميل',    // arabe: "En cours de chargement"
    'Loading...',
    'Chargement...',
    'يتم التحميل',     // arabe: "En train de charger"
  ]

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await page.evaluate((loadingIndicators) => {
        // Vérifier si des indicateurs de chargement sont visibles
        const bodyText = document.body.textContent || ''
        const hasLoadingText = loadingIndicators.some(text => bodyText.includes(text))

        // Calculer le contenu total (sans scripts/styles/nav)
        const body = document.body.cloneNode(true) as HTMLElement
        body.querySelectorAll('script, style, noscript, nav, header, footer, .cookie-banner').forEach(el => el.remove())
        const cleanText = body.textContent?.trim() || ''

        return {
          hasLoadingText,
          contentLength: cleanText.length,
          preview: cleanText.substring(0, 200),
        }
      }, loadingTexts)

      // Si pas d'indicateur de chargement et contenu suffisant
      if (!result.hasLoadingText && result.contentLength >= minContentLength) {
        console.log(`[Scraper] Contenu chargé: ${result.contentLength} caractères`)
        return
      }

      // Si contenu très long même avec chargement en cours, on accepte
      if (result.contentLength >= 2000) {
        console.log(`[Scraper] Contenu suffisant (${result.contentLength} chars) malgré chargement en cours`)
        return
      }

      // Attendre avant la prochaine vérification
      await page.waitForTimeout(checkInterval)

    } catch {
      break
    }
  }

  console.log('[Scraper] Timeout en attendant le chargement du contenu')
}

/**
 * Scroll la page pour déclencher le lazy loading
 */
async function scrollPageForLazyLoading(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
  scrollCount: number
): Promise<void> {
  const viewportHeight = await page.evaluate(() => window.innerHeight)
  const documentHeight = await page.evaluate(() => document.body.scrollHeight)

  // Calculer les positions de scroll
  const scrollStep = documentHeight / (scrollCount + 1)

  for (let i = 1; i <= scrollCount; i++) {
    const scrollTo = Math.min(scrollStep * i, documentHeight - viewportHeight)

    await page.evaluate((y) => {
      window.scrollTo({ top: y, behavior: 'smooth' })
    }, scrollTo)

    // Attendre que le contenu se charge
    await page.waitForTimeout(800)

    // Attendre la stabilisation du réseau
    try {
      await page.waitForLoadState('networkidle', { timeout: 3000 })
    } catch {
      // Ignorer le timeout
    }
  }

  // Revenir en haut de la page
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(300)
}

/**
 * Scrape une URL et extrait le contenu
 * Mode AUTO-ADAPTATIF: détecte automatiquement si le site est dynamique
 */
export async function scrapeUrl(
  url: string,
  source: Partial<WebSource>
): Promise<{ success: boolean; content?: ScrapedContent; error?: string; fetchResult?: FetchResult; detectedFrameworks?: string[] }> {

  const fetchOptions: FetchOptions = {
    userAgent: source.userAgent || DEFAULT_USER_AGENT,
    timeout: source.timeoutMs || DEFAULT_TIMEOUT_MS,
    headers: source.customHeaders || {},
    respectRobotsTxt: source.respectRobotsTxt !== false,
    dynamicConfig: source.dynamicConfig || undefined,
  }

  let fetchResult: FetchResult
  let detectedFrameworks: string[] = []

  // Si requiresJavascript est explicitement défini, l'utiliser
  if (source.requiresJavascript !== undefined) {
    fetchResult = source.requiresJavascript
      ? await fetchHtmlDynamic(url, fetchOptions)
      : await fetchHtml(url, fetchOptions)
  } else {
    // Mode AUTO-ADAPTATIF: essayer d'abord en statique
    fetchResult = await fetchHtml(url, fetchOptions)

    if (fetchResult.success && fetchResult.html) {
      // Analyser si le contenu semble incomplet ou dynamique
      const needsDynamic = detectDynamicContent(fetchResult.html)

      if (needsDynamic) {
        console.log(`[Scraper] Contenu dynamique détecté pour ${url}, passage en mode Playwright`)
        // Réessayer avec Playwright
        const dynamicResult = await fetchHtmlDynamic(url, fetchOptions)
        if (dynamicResult.success) {
          fetchResult = dynamicResult
        }
      }
    } else if (!fetchResult.success) {
      // Si le fetch statique échoue, essayer dynamique
      console.log(`[Scraper] Fetch statique échoué pour ${url}, tentative dynamique`)
      fetchResult = await fetchHtmlDynamic(url, fetchOptions)
    }
  }

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

    // Vérifier la qualité du contenu extrait
    if (content.content.length < 100) {
      // Contenu trop court, peut-être qu'on n'a pas capturé le contenu dynamique
      console.log(`[Scraper] Contenu trop court (${content.content.length} chars), possible contenu dynamique non chargé`)
    }

    return {
      success: true,
      content,
      fetchResult,
      detectedFrameworks,
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
 * Détecte si le HTML contient des indices de contenu dynamique non chargé
 */
function detectDynamicContent(html: string): boolean {
  const lowerHtml = html.toLowerCase()

  // Indicateurs de frameworks JavaScript
  const jsFrameworkIndicators = [
    // Livewire
    'wire:',
    'livewire',
    '@livewireScripts',
    // Alpine.js
    'x-data=',
    'x-show=',
    'x-if=',
    // React
    'data-reactroot',
    '__NEXT_DATA__',
    'react-app',
    // Vue
    'data-v-',
    'v-if=',
    'v-for=',
    ':class=',
    'vue-app',
    // Angular
    'ng-app',
    'ng-controller',
    '_ngcontent',
    'ng-version',
    // Svelte
    'svelte-',
    // HTMX
    'hx-get',
    'hx-post',
    'hx-trigger',
    // Turbo
    'data-turbo',
    // SPA patterns
    'app-root',
    '#app',
    '#root',
  ]

  // Indicateurs de contenu en cours de chargement
  const loadingIndicators = [
    'loading...',
    'chargement...',
    'التحميل...',
    'جاري التحميل',
    '<div id="app"></div>',
    '<div id="root"></div>',
    'data-loading',
    'is-loading',
    'skeleton',
  ]

  // Vérifier les indicateurs de frameworks
  for (const indicator of jsFrameworkIndicators) {
    if (lowerHtml.includes(indicator.toLowerCase())) {
      return true
    }
  }

  // Vérifier les indicateurs de chargement
  for (const indicator of loadingIndicators) {
    if (lowerHtml.includes(indicator.toLowerCase())) {
      return true
    }
  }

  // Vérifier si le body est presque vide (SPA non rendu)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  if (bodyMatch) {
    const bodyContent = bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '')
                                    .replace(/<style[\s\S]*?<\/style>/gi, '')
                                    .replace(/<[^>]+>/g, '')
                                    .trim()
    // Si le body a moins de 500 caractères de texte visible, c'est probablement un SPA
    if (bodyContent.length < 500) {
      return true
    }
  }

  return false
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
