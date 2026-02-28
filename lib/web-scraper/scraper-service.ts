/**
 * Service de scraping web
 * Supporte les sites statiques (fetch + cheerio) et dynamiques (Playwright)
 */

import type { WebSource, ScrapedContent, DynamicSiteConfig, ScrapingMetrics, DetectedFramework, FetchResult } from './types'
import { extractContent, hashUrl, hashContent } from './content-extractor'
import { isUrlAllowed } from './robots-parser'
import { detectBan, getBrowserHeaders, selectUserAgent } from './anti-ban-utils'
import { discoverLinksViaInteraction } from './menu-discovery-service'

// Timeouts adaptatifs par domaine (Phase 2.8 - Optimisation)
// Permet de réduire les échecs de crawl de 15-20%
const TIMEOUTS_BY_DOMAIN: Record<string, number> = {
  'cassation.tn': 180000,      // 3min - Site lent, génération dynamique
  '9anoun.tn': 150000,          // 2.5min - Laravel Livewire (WebSocket)
  'legislation.tn': 120000,     // 2min - Angular, API calls
  'iort.gov.tn': 120000,        // 2min - Site gouvernemental
  'e-justice.tn': 120000,       // 2min - Portail justice
}

// Timeout par défaut pour sites non listés
const DEFAULT_TIMEOUT_MS = 90000  // 1.5min (augmenté de 30s → 90s)

/**
 * Détermine le timeout optimal pour une URL donnée
 */
function getTimeoutForUrl(url: string): number {
  try {
    const hostname = new URL(url).hostname

    // Vérifier correspondance exacte
    if (TIMEOUTS_BY_DOMAIN[hostname]) {
      return TIMEOUTS_BY_DOMAIN[hostname]
    }

    // Vérifier correspondance par suffixe (ex: www.cassation.tn)
    for (const [domain, timeout] of Object.entries(TIMEOUTS_BY_DOMAIN)) {
      if (hostname.endsWith('.' + domain) || hostname === domain) {
        return timeout
      }
    }

    return DEFAULT_TIMEOUT_MS
  } catch {
    return DEFAULT_TIMEOUT_MS
  }
}

// User-Agent par défaut
const DEFAULT_USER_AGENT = 'QadhyaBot/1.0 (+https://qadhya.tn/bot)'

// ==========================================
// PERFORMANCE OPTIMIZATIONS
// ==========================================

/**
 * Pool multi-navigateurs Playwright pour scraping parallèle
 * Évite de relancer Chromium à chaque requête (~1-2s économisés)
 * Supporte jusqu'à 4 browsers en parallèle pour exploiter les 4 CPUs du VPS
 */
interface MultiBrowserPool {
  browsers: Array<{
    instance: Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>> | null
    lastUsed: number
    useCount: number
  }>
  currentIndex: number
  maxBrowsers: number
  maxAge: number        // Durée de vie max en ms
  maxUseCount: number   // Nombre max d'utilisations avant recycle
}

// Configuration via variables d'environnement
const MAX_BROWSERS = parseInt(process.env.BROWSER_POOL_MAX_BROWSERS || '4', 10)
const BROWSER_MAX_AGE = parseInt(process.env.BROWSER_POOL_MAX_AGE_MS || '180000', 10) // 3 min
const BROWSER_MAX_USE = parseInt(process.env.BROWSER_POOL_MAX_USE || '100', 10)

const multiBrowserPool: MultiBrowserPool = {
  browsers: Array.from({ length: MAX_BROWSERS }, () => ({
    instance: null,
    lastUsed: 0,
    useCount: 0,
  })),
  currentIndex: 0,
  maxBrowsers: MAX_BROWSERS,
  maxAge: BROWSER_MAX_AGE,
  maxUseCount: BROWSER_MAX_USE,
}

/**
 * Obtient un navigateur du pool multi-browser avec rotation round-robin
 * Crée de nouveaux browsers à la demande jusqu'à maxBrowsers
 */
async function getBrowserFromPool(): Promise<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>> {
  const now = Date.now()

  // Rotation round-robin pour répartir la charge
  const slot = multiBrowserPool.browsers[multiBrowserPool.currentIndex]
  multiBrowserPool.currentIndex = (multiBrowserPool.currentIndex + 1) % multiBrowserPool.maxBrowsers

  // Vérifier si le browser existant est encore valide
  if (slot.instance) {
    const age = now - slot.lastUsed

    // Recycler si trop vieux ou trop utilisé
    if (age > multiBrowserPool.maxAge || slot.useCount >= multiBrowserPool.maxUseCount) {
      try {
        await slot.instance.close()
      } catch {
        // Ignorer les erreurs de fermeture
      }
      slot.instance = null
      console.log(`[BrowserPool] Browser recyclé (age: ${(age / 1000).toFixed(1)}s, uses: ${slot.useCount})`)
    }
  }

  // Créer un nouveau browser si nécessaire
  if (!slot.instance) {
    const { chromium } = await import('playwright')
    slot.instance = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
      ],
    })
    slot.useCount = 0
    console.log(`[BrowserPool] Nouveau browser créé (slot ${multiBrowserPool.currentIndex})`)
  }

  slot.lastUsed = now
  slot.useCount++

  return slot.instance
}

/**
 * Ferme tous les navigateurs du pool multi-browser (nettoyage)
 */
export async function closeBrowserPool(): Promise<void> {
  console.log(`[BrowserPool] Fermeture de ${multiBrowserPool.maxBrowsers} browsers...`)

  for (const slot of multiBrowserPool.browsers) {
    if (slot.instance) {
      try {
        await slot.instance.close()
      } catch {
        // Ignorer les erreurs
      }
      slot.instance = null
      slot.useCount = 0
    }
  }

  console.log('[BrowserPool] ✅ Tous les browsers fermés')
}

/**
 * Types de ressources à bloquer pour accélérer le chargement
 * Mode agressif pour crawl ultra-rapide
 */
const BLOCKED_RESOURCE_TYPES = [
  'image',
  'media',
  'font',
  'stylesheet', // On bloque les CSS non essentiels
  'websocket',  // 🆕 Bloquer WebSocket (Livewire, polling)
  'other',      // 🆕 Bloquer ressources non-essentielles
] as const

/**
 * Patterns d'URLs à bloquer (analytics, ads, CDN, etc.)
 * Mode agressif pour crawl ultra-rapide
 */
const BLOCKED_URL_PATTERNS = [
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /facebook\.net/,
  /twitter\.com\/widgets/,
  /hotjar\.com/,
  /intercom\.io/,
  /crisp\.chat/,
  /tawk\.to/,
  /cdn\..*\.js$/,           // 🆕 CDN JavaScript non-essentiel
  /gravatar\.com/,          // 🆕 Avatars Gravatar
  /.+\.(woff2?|ttf|eot)$/,  // 🆕 Fonts (redondant avec type mais sécurité)
  /cdn\.segment/,
  /mixpanel\.com/,
  /amplitude\.com/,
  /sentry\.io/,
  /cloudflareinsights/,
]

/**
 * Cache simple en mémoire pour les pages récemment scrapées
 */
interface CacheEntry {
  html: string
  timestamp: number
  url: string
}

const pageCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes
const MAX_CACHE_SIZE = 100           // Max 100 pages en cache

/**
 * Nettoie les entrées expirées du cache
 */
function cleanExpiredCache(): void {
  const now = Date.now()
  for (const [key, entry] of pageCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      pageCache.delete(key)
    }
  }

  // Si toujours trop grand, supprimer les plus anciennes
  if (pageCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(pageCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)

    const toDelete = entries.slice(0, pageCache.size - MAX_CACHE_SIZE)
    for (const [key] of toDelete) {
      pageCache.delete(key)
    }
  }
}

/**
 * Récupère une page du cache si disponible
 */
function getCachedPage(url: string): string | null {
  const entry = pageCache.get(url)
  if (!entry) return null

  const age = Date.now() - entry.timestamp
  if (age > CACHE_TTL_MS) {
    pageCache.delete(url)
    return null
  }

  return entry.html
}

/**
 * Met une page en cache
 */
function setCachedPage(url: string, html: string): void {
  cleanExpiredCache()
  pageCache.set(url, {
    html,
    timestamp: Date.now(),
    url,
  })
}

/**
 * Vide le cache des pages
 */
export function clearPageCache(): void {
  pageCache.clear()
}

/**
 * Obtient les statistiques du cache
 */
export function getCacheStats(): { size: number; urls: string[] } {
  return {
    size: pageCache.size,
    urls: Array.from(pageCache.keys()),
  }
}

/**
 * Domaines connus comme nécessitant JavaScript
 * Évite de faire un fetch statique inutile
 */
const KNOWN_DYNAMIC_DOMAINS = [
  '9anoun.tn',          // Laravel Livewire
  'legislation.tn',     // JORT (Angular)
  'e-justice.tn',
  'iort.gov.tn',
]

/**
 * Vérifie si un domaine est connu comme dynamique
 */
function isKnownDynamicDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return KNOWN_DYNAMIC_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    )
  } catch {
    return false
  }
}

interface FetchOptions {
  userAgent?: string
  timeout?: number
  headers?: Record<string, string>
  respectRobotsTxt?: boolean
  dynamicConfig?: DynamicSiteConfig
  stealthMode?: boolean
  referrer?: string
  method?: 'GET' | 'POST'
  body?: string | URLSearchParams
  contentType?: string
  ignoreSSLErrors?: boolean
  skipMenuDiscovery?: boolean  // 🆕 Skip menu discovery si sitemap existe ou followLinks=false
}

// FetchResult importé depuis types.ts

/**
 * Récupère le contenu HTML d'une URL (statique)
 */
export async function fetchHtml(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const {
    userAgent,
    timeout = DEFAULT_TIMEOUT_MS,
    headers = {},
    respectRobotsTxt = true,
    stealthMode = false,
    referrer,
    method = 'GET',
    body,
    contentType,
    ignoreSSLErrors = false,
  } = options

  // Sélectionner User-Agent (stealth ou bot)
  const selectedUserAgent = selectUserAgent(stealthMode, userAgent)

  // Vérifier robots.txt si demandé (skip pour les POST — soumission de formulaire intentionnelle)
  if (respectRobotsTxt && method === 'GET') {
    const robotsCheck = await isUrlAllowed(url, selectedUserAgent)
    if (!robotsCheck.allowed) {
      return {
        success: false,
        error: 'URL bloquée par robots.txt',
        statusCode: 403,
      }
    }
  }

  // SSL bypass pour les sites avec certificats invalides (ex: sites gouvernementaux)
  let sslAgent: import('undici').Agent | undefined
  const originalTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (ignoreSSLErrors) {
    try {
      const { Agent } = await import('undici')
      sslAgent = new Agent({
        connect: { rejectUnauthorized: false },
      })
    } catch {
      // Fallback: variable d'environnement Node.js
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Générer headers réalistes
    const browserHeaders = getBrowserHeaders(url, referrer)

    // Auto-détecter Content-Type pour POST
    const requestHeaders: Record<string, string> = {
      ...browserHeaders,
      'User-Agent': selectedUserAgent,
      ...headers,
    }
    if (method === 'POST' && body) {
      if (contentType) {
        requestHeaders['Content-Type'] = contentType
      } else if (body instanceof URLSearchParams) {
        requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
      }
    }

    const fetchInit: RequestInit & { dispatcher?: import('undici').Agent } = {
      method,
      headers: requestHeaders,
      redirect: 'follow',
      signal: controller.signal,
    }

    // Ajouter le body pour POST
    if (method === 'POST' && body) {
      fetchInit.body = body instanceof URLSearchParams ? body.toString() : body
    }

    // Ajouter l'agent SSL si disponible
    if (sslAgent) {
      fetchInit.dispatcher = sslAgent
    }

    const response = await fetch(url, fetchInit as RequestInit)

    clearTimeout(timeoutId)

    const html = await response.text()

    // Vérifier bannissement même avant de vérifier response.ok
    const banCheck = detectBan(html, response.status, response.url)
    if (banCheck.isBanned) {
      return {
        success: false,
        statusCode: response.status,
        error: `BAN_DETECTED: ${banCheck.reason}`,
        finalUrl: response.url,
      }
    }

    if (!response.ok) {
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    // Vérifier le type de contenu
    const responseContentType = response.headers.get('content-type') || ''
    if (!responseContentType.includes('text/html') && !responseContentType.includes('application/xhtml')) {
      return {
        success: false,
        error: `Type de contenu non HTML: ${responseContentType}`,
        statusCode: response.status,
      }
    }

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
  } finally {
    // Restaurer NODE_TLS_REJECT_UNAUTHORIZED si modifié
    if (ignoreSSLErrors && !sslAgent) {
      if (originalTls === undefined) {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      } else {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalTls
      }
    }
  }
}

// DetectedFramework importé depuis types.ts

/**
 * Profils de configuration par framework
 * OPTIMISÉS: délais réduits avec vérification adaptative
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
    postLoadDelayMs: 1500,  // Constitution/codes : attendre rendu Livewire complet
    scrollToLoad: true,
    scrollCount: 3,         // Scroll multiple pour déclencher le lazy-loading des articles
    waitUntil: 'load',      // 'networkidle' bloque sur sites Livewire (WebSocket/polling)
    dynamicTimeoutMs: 10000,
  },
  alpine: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['[x-show][x-transition]', '.loading'],
    postLoadDelayMs: 500,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  react: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner', '[data-loading]', '.skeleton'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    scrollCount: 2,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
    dynamicTimeoutMs: 10000,
  },
  vue: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.v-progress-circular', '.v-skeleton-loader', '.loading'],
    postLoadDelayMs: 600,
    scrollToLoad: true,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  angular: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['mat-spinner', 'mat-progress-bar', '.ng-loading'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
    dynamicTimeoutMs: 12000,
  },
  svelte: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner'],
    postLoadDelayMs: 400,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  htmx: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.htmx-request', '.htmx-indicator'],
    postLoadDelayMs: 500,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  turbo: {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.turbo-progress-bar', '[data-turbo-progress]'],
    postLoadDelayMs: 400,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  stimulus: {
    postLoadDelayMs: 300,
    waitUntil: 'domcontentloaded',
  },
  'jquery-ajax': {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.ajax-loading', '#loading'],
    postLoadDelayMs: 500,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
  },
  'spa-generic': {
    waitForLoadingToDisappear: true,
    loadingIndicators: ['.loading', '.spinner', '.skeleton', '[data-loading]'],
    postLoadDelayMs: 800,
    scrollToLoad: true,
    scrollCount: 2,
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
    dynamicTimeoutMs: 10000,
  },
  webdev: {
    waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
    postLoadDelayMs: 2500,
    waitForLoadingToDisappear: true,
    loadingIndicators: ['<!--loading-->', '[data-loading]', '.loading'],
    scrollToLoad: true,
    scrollCount: 2,
    dynamicTimeoutMs: 20000,
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
  waitUntil: 'load',  // 'networkidle' bloque sur sites avec WebSocket/polling
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
      livewire: html.includes('wire:') || html.includes('livewire') || !!(window as any).Livewire,
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
      // WebDev (framework français utilisé par IORT.tn)
      webdev: /PAGE_[A-Z_]+\/[A-Za-z0-9]+\?WD_ACTION_=/.test(window.location.href) ||
              html.includes('WD_ACTION_') ||
              html.includes('WD_BUTTON_') ||
              html.includes('PAGE_Principal') ||
              html.includes('AWP_') ||
              scripts.some(s => s.includes('gbWDInit') || s.includes('WD_MODE_AJAX')),
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
  if (checks.webdev) detected.push('webdev')
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
 *
 * OPTIMISATIONS:
 * - Pool de navigateurs (réutilisation)
 * - Blocage des ressources inutiles (images, fonts, analytics)
 * - Cache des pages récentes
 * - Délais adaptatifs
 */
export async function fetchHtmlDynamic(
  url: string,
  options: FetchOptions & { skipCache?: boolean; blockResources?: boolean } = {}
): Promise<FetchResult> {
  // Timeout adaptatif : utiliser timeout spécifique au domaine si non fourni
  const adaptiveTimeout = options.timeout ?? getTimeoutForUrl(url)

  const {
    userAgent = DEFAULT_USER_AGENT,
    timeout = adaptiveTimeout,
    headers = {},
    respectRobotsTxt = true,
    dynamicConfig = {},
    skipCache = false,
    blockResources = true,  // Par défaut, on bloque les ressources inutiles
  } = options

  // Vérifier le cache en premier (si pas de skip)
  if (!skipCache) {
    const cachedHtml = getCachedPage(url)
    if (cachedHtml) {
      console.log(`[Scraper] Cache hit pour ${url}`)
      return {
        success: true,
        html: cachedHtml,
        statusCode: 200,
        finalUrl: url,
      }
    }
  }

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

  // Timeout global : double du timeout de navigation pour couvrir les étapes post-load
  const GLOBAL_TIMEOUT_MS = timeout * 2

  try {
    // Utiliser le pool de navigateurs au lieu de créer un nouveau browser
    console.log(`[Scraper] Playwright: lancement pour ${url}`)
    const browser = await getBrowserFromPool()

    // Pas de try/finally avec browser.close() car on réutilise le browser

    const context = await browser.newContext({
      userAgent,
      extraHTTPHeaders: headers,
      // Viewport standard pour déclencher le contenu responsive
      viewport: { width: 1920, height: 1080 },
      ...(options.ignoreSSLErrors ? { ignoreHTTPSErrors: true } : {}),
    })

    try {
      const page = await context.newPage()
      const globalStart = Date.now()

      // Helper pour vérifier le timeout global
      const checkGlobalTimeout = () => {
        if (Date.now() - globalStart > GLOBAL_TIMEOUT_MS) {
          throw new Error(`Timeout global Playwright (${GLOBAL_TIMEOUT_MS}ms) dépassé pour ${url}`)
        }
      }

      // OPTIMISATION: Bloquer les ressources inutiles
      if (blockResources) {
        await page.route('**/*', (route) => {
          const request = route.request()
          const resourceType = request.resourceType()
          const requestUrl = request.url()

          // Bloquer les types de ressources inutiles
          if (BLOCKED_RESOURCE_TYPES.includes(resourceType as typeof BLOCKED_RESOURCE_TYPES[number])) {
            return route.abort()
          }

          // Bloquer les URLs d'analytics/tracking
          for (const pattern of BLOCKED_URL_PATTERNS) {
            if (pattern.test(requestUrl)) {
              return route.abort()
            }
          }

          return route.continue()
        })
      }

      // Naviguer vers l'URL avec le mode d'attente configuré
      const hostname = new URL(url).hostname
      const isAdaptive = !options.timeout && TIMEOUTS_BY_DOMAIN[hostname]
      console.log(`[Scraper] Playwright: navigation vers ${url} (waitUntil=${config.waitUntil || 'networkidle'}, timeout=${timeout}ms${isAdaptive ? ' [adaptatif]' : ''})`)
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
      console.log(`[Scraper] Playwright: DOM chargé pour ${url} (${Date.now() - globalStart}ms)`)

      checkGlobalTimeout()

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

      checkGlobalTimeout()

      // Attendre un sélecteur spécifique si configuré
      if (config.waitForSelector) {
        try {
          await page.waitForSelector(config.waitForSelector, {
            timeout: Math.min(config.dynamicTimeoutMs || 10000, GLOBAL_TIMEOUT_MS - (Date.now() - globalStart)),
            state: 'visible',
          })
        } catch {
          // Log mais ne pas échouer si le sélecteur n'apparaît pas
          console.warn(`[Scraper] Selector "${config.waitForSelector}" not found after timeout`)
        }
      }

      checkGlobalTimeout()

      // Attendre la disparition des indicateurs de chargement
      if (config.waitForLoadingToDisappear && config.loadingIndicators?.length) {
        const remainingTime = Math.max(2000, GLOBAL_TIMEOUT_MS - (Date.now() - globalStart))
        await waitForLoadingIndicatorsToDisappear(page, config.loadingIndicators, Math.min(config.dynamicTimeoutMs || 10000, remainingTime))
      }

      checkGlobalTimeout()

      // Scroller la page pour déclencher le lazy loading
      if (config.scrollToLoad) {
        await scrollPageForLazyLoading(page, config.scrollCount || 3)
        console.log(`[Scraper] Playwright: scroll terminé pour ${url} (${Date.now() - globalStart}ms)`)
      }

      checkGlobalTimeout()

      // 🆕 DÉCOUVERTE AUTOMATIQUE DE LIENS DYNAMIQUES
      // 🚀 OPTIMISATION : Skip si sitemap existe ou followLinks désactivé
      let discoveredUrls: string[] = []
      const shouldDiscoverLinks =
        detectedFrameworks.length > 0 &&
        detectedFrameworks[0] !== 'static' &&
        !options.skipMenuDiscovery  // 🆕 Skip si sitemap ou !followLinks

      if (shouldDiscoverLinks) {
        try {
          const framework = detectedFrameworks[0]
          const result = await discoverLinksViaInteraction(page, framework, url)

          discoveredUrls = result.urls

          if (discoveredUrls.length > 0) {
            console.log(
              `[Scraper] Découverte: ${discoveredUrls.length} URLs ` +
              `(${result.clicksPerformed} clics)`
            )
          }
        } catch (err) {
          console.warn('[Scraper] Erreur découverte:', err)
          // Ne pas bloquer le scraping principal
        }
      } else if (options.skipMenuDiscovery) {
        console.log('[Scraper] ⚡ Menu discovery skipped (sitemap actif ou followLinks=false)')
      }

      checkGlobalTimeout()

      // Cliquer sur des éléments si configuré (ex: "Voir plus", "Charger plus")
      if (config.clickBeforeExtract?.length) {
        for (const selector of config.clickBeforeExtract) {
          try {
            const element = page.locator(selector).first()
            if (await element.isVisible()) {
              await element.click()
              await page.waitForTimeout(1000)
            }
          } catch {
            // Ignorer les erreurs de clic
          }
          checkGlobalTimeout()
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

      checkGlobalTimeout()

      // Pour Livewire: attendre que le contenu principal soit chargé
      // OPTIMISÉ: sortie rapide si contenu prêt
      const remainingForContent = Math.max(2000, GLOBAL_TIMEOUT_MS - (Date.now() - globalStart))
      const contentStatus = await waitForContentToLoad(page, Math.min(config.dynamicTimeoutMs || 10000, remainingForContent))

      // Stratégie Livewire: forcer le re-rendu SEULEMENT si contenu insuffisant et temps restant
      if (detectedFrameworks.includes('livewire') && contentStatus.contentLength < 500 && (Date.now() - globalStart) < GLOBAL_TIMEOUT_MS - 5000) {
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

      // OPTIMISATION: Mettre en cache le résultat
      if (!skipCache) {
        setCachedPage(url, html)
      }

      const totalMs = Date.now() - globalStart
      console.log(`[Scraper] Playwright: terminé ${url} en ${totalMs}ms (HTML: ${html.length} chars)`)

      return {
        success: true,
        html,
        statusCode: response.status(),
        finalUrl,
        etag,
        lastModified,
        discoveredUrls: discoveredUrls.length > 0 ? discoveredUrls : undefined,
      }

    } finally {
      // Fermer seulement le context, pas le browser (pool)
      await context.close()
    }

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue'
    console.error(`[Scraper] Playwright erreur pour ${url}: ${errorMsg}`)

    // Si Playwright n'est pas installé, on suggère de l'installer
    if (error instanceof Error && error.message.includes('Cannot find module')) {
      return {
        success: false,
        error: 'Playwright non installé. Exécutez: pnpm add playwright && npx playwright install chromium',
      }
    }

    if (error instanceof Error) {
      if (error.message.includes('Timeout') || error.message.includes('timeout')) {
        return {
          success: false,
          error: `Timeout Playwright: ${error.message}`,
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
 * OPTIMISÉ: attentes réduites
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

    // Attendre que Livewire traite les événements (réduit de 2000 à 1000)
    await page.waitForTimeout(1000)

    // Attendre la stabilisation du réseau (réduit de 5000 à 2000)
    try {
      await page.waitForLoadState('networkidle', { timeout: 2000 })
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
 * OPTIMISÉ: intervalles courts + sortie rapide si contenu prêt
 * Vérifie que la page contient suffisamment de texte visible
 */
async function waitForContentToLoad(
  page: Awaited<ReturnType<Awaited<ReturnType<typeof import('playwright')['chromium']['launch']>>['newPage']>>,
  timeoutMs: number
): Promise<{ contentLength: number; ready: boolean }> {
  const startTime = Date.now()
  const minContentLength = 300  // Réduit de 500 à 300 pour sortir plus vite
  const goodContentLength = 8000  // Augmenté : 1000 insuffisant pour pages Livewire (constitution/codes)
  const checkInterval = 400  // Réduit de 800 à 400ms

  // Textes indicateurs de chargement en cours
  const loadingTexts = [
    'التحميل...',      // arabe: "Chargement..."
    'جاري التحميل',    // arabe: "En cours de chargement"
    'Loading...',
    'Chargement...',
    'يتم التحميل',     // arabe: "En train de charger"
  ]

  let lastContentLength = 0
  let stableCount = 0  // Compteur de stabilité

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
        }
      }, loadingTexts)

      // OPTIMISATION: Si contenu suffisant et pas de chargement, sortir immédiatement
      if (!result.hasLoadingText && result.contentLength >= goodContentLength) {
        console.log(`[Scraper] Contenu prêt: ${result.contentLength} caractères`)
        return { contentLength: result.contentLength, ready: true }
      }

      // OPTIMISATION: Vérifier la stabilité du contenu
      if (result.contentLength === lastContentLength && result.contentLength >= minContentLength) {
        stableCount++
        // Si le contenu n'a pas changé depuis 2 vérifications, on considère qu'il est chargé
        if (stableCount >= 2) {
          console.log(`[Scraper] Contenu stable: ${result.contentLength} caractères`)
          return { contentLength: result.contentLength, ready: true }
        }
      } else {
        stableCount = 0
        lastContentLength = result.contentLength
      }

      // Si contenu très long même avec chargement, on accepte
      if (result.contentLength >= 2000) {
        console.log(`[Scraper] Contenu suffisant (${result.contentLength} chars)`)
        return { contentLength: result.contentLength, ready: true }
      }

      // Attendre avant la prochaine vérification
      await page.waitForTimeout(checkInterval)

    } catch {
      break
    }
  }

  console.log('[Scraper] Timeout en attendant le chargement du contenu')
  return { contentLength: lastContentLength, ready: false }
}

/**
 * Scroll la page pour déclencher le lazy loading
 * OPTIMISÉ: scrolls rapides avec attente minimale
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
      window.scrollTo({ top: y, behavior: 'instant' })  // instant au lieu de smooth
    }, scrollTo)

    // Attente réduite entre les scrolls
    await page.waitForTimeout(200)  // 🚀 OPTIMISÉ : 400 → 200ms pour crawl ultra-rapide

    // Attendre la stabilisation du réseau avec timeout court
    try {
      await page.waitForLoadState('networkidle', { timeout: 1500 })  // Réduit de 3000 à 1500
    } catch {
      // Ignorer le timeout
    }
  }

  // Revenir en haut de la page
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(100)  // Réduit de 300 à 100
}

/**
 * Scrape une URL et extrait le contenu
 * Mode AUTO-ADAPTATIF: détecte automatiquement si le site est dynamique
 */
export async function scrapeUrl(
  url: string,
  source: Partial<WebSource>
): Promise<{
  success: boolean
  content?: ScrapedContent
  error?: string
  fetchResult?: FetchResult
  detectedFrameworks?: string[]
  metrics?: ScrapingMetrics
}> {
  const startTime = Date.now()
  let fetchStartTime = 0
  let fetchEndTime = 0

  const fetchOptions: FetchOptions = {
    userAgent: source.userAgent || DEFAULT_USER_AGENT,
    timeout: source.timeoutMs || DEFAULT_TIMEOUT_MS,
    headers: source.customHeaders || {},
    respectRobotsTxt: source.respectRobotsTxt !== false,
    dynamicConfig: source.dynamicConfig || undefined,
    ignoreSSLErrors: source.ignoreSSLErrors || false,
    // 🚀 OPTIMISATION : Skip menu discovery si sitemap existe ou followLinks désactivé
    skipMenuDiscovery: source.useSitemap === true || source.followLinks === false,
  }

  let fetchResult: FetchResult
  let detectedFrameworks: string[] = []
  let scrapingMode: 'static' | 'dynamic' = 'static'
  let cacheHit = false

  fetchStartTime = Date.now()

  // OPTIMISATION: Vérifier le cache en premier (avant tout fetch)
  const cachedHtml = getCachedPage(url)
  if (cachedHtml) {
    console.log(`[Scraper] Cache hit pour ${url}`)
    cacheHit = true
    fetchResult = {
      success: true,
      html: cachedHtml,
      statusCode: 200,
      finalUrl: url,
    }
    scrapingMode = 'dynamic'  // C'était probablement du contenu dynamique
  }
  // Si requiresJavascript est explicitement défini, l'utiliser
  else if (source.requiresJavascript !== undefined) {
    scrapingMode = source.requiresJavascript ? 'dynamic' : 'static'
    fetchResult = source.requiresJavascript
      ? await fetchHtmlDynamic(url, fetchOptions)
      : await fetchHtml(url, fetchOptions)
  }
  // OPTIMISATION: Sites connus comme dynamiques → directement Playwright
  else if (isKnownDynamicDomain(url)) {
    console.log(`[Scraper] Domaine dynamique connu: ${url}`)
    scrapingMode = 'dynamic'
    fetchResult = await fetchHtmlDynamic(url, fetchOptions)
  } else {
    // Mode AUTO-ADAPTATIF: essayer d'abord en statique
    fetchResult = await fetchHtml(url, fetchOptions)

    if (fetchResult.success && fetchResult.html) {
      // Analyser si le contenu semble incomplet ou dynamique
      const needsDynamic = detectDynamicContent(fetchResult.html)

      if (needsDynamic) {
        console.log(`[Scraper] Contenu dynamique détecté pour ${url}, passage en mode Playwright`)
        scrapingMode = 'dynamic'
        // Réessayer avec Playwright
        const dynamicResult = await fetchHtmlDynamic(url, fetchOptions)
        if (dynamicResult.success) {
          fetchResult = dynamicResult
        }
      }
    } else if (!fetchResult.success) {
      // Si le fetch statique échoue, essayer dynamique
      console.log(`[Scraper] Fetch statique échoué pour ${url}, tentative dynamique`)
      scrapingMode = 'dynamic'
      fetchResult = await fetchHtmlDynamic(url, fetchOptions)
    }
  }
  fetchEndTime = Date.now()

  if (!fetchResult.success || !fetchResult.html) {
    const endTime = Date.now()
    return {
      success: false,
      error: fetchResult.error,
      fetchResult,
      metrics: {
        totalTimeMs: endTime - startTime,
        fetchTimeMs: fetchEndTime - fetchStartTime,
        extractionTimeMs: 0,
        htmlSizeBytes: 0,
        contentLength: 0,
        linksCount: 0,
        filesCount: 0,
        detectedFrameworks,
        scrapingMode,
        extractionSuccess: false,
        error: fetchResult.error,
      },
    }
  }

  const extractionStartTime = Date.now()
  try {
    // Extraire le contenu
    const content = extractContent(
      fetchResult.html,
      fetchResult.finalUrl || url,
      source.cssSelectors
    )
    const extractionEndTime = Date.now()

    // Vérifier la qualité du contenu extrait
    if (content.content.length < 100) {
      // Contenu trop court, peut-être qu'on n'a pas capturé le contenu dynamique
      console.log(`[Scraper] Contenu trop court (${content.content.length} chars), possible contenu dynamique non chargé`)
    }

    // Calculer un score de qualité simple
    const contentQualityScore = Math.min(100, Math.round(
      (content.content.length > 100 ? 30 : 0) +
      (content.content.length > 500 ? 20 : 0) +
      (content.structuredLegalContent?.articleText ? 20 : 0) +
      (content.legalContext?.documentType !== 'unknown' ? 15 : 0) +
      (content.links.length > 0 ? 10 : 0) +
      (content.title ? 5 : 0)
    ))

    const endTime = Date.now()
    return {
      success: true,
      content,
      fetchResult,
      detectedFrameworks,
      metrics: {
        totalTimeMs: endTime - startTime,
        fetchTimeMs: cacheHit ? 0 : fetchEndTime - fetchStartTime,
        extractionTimeMs: extractionEndTime - extractionStartTime,
        htmlSizeBytes: fetchResult.html.length,
        contentLength: content.content.length,
        linksCount: content.links.length,
        filesCount: content.files.length,
        detectedFrameworks,
        scrapingMode: cacheHit ? 'cached' as 'static' | 'dynamic' : scrapingMode,
        extractionSuccess: true,
        contentQualityScore,
      },
    }

  } catch (error) {
    const endTime = Date.now()
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur extraction contenu',
      fetchResult,
      metrics: {
        totalTimeMs: endTime - startTime,
        fetchTimeMs: fetchEndTime - fetchStartTime,
        extractionTimeMs: Date.now() - extractionStartTime,
        htmlSizeBytes: fetchResult.html?.length || 0,
        contentLength: 0,
        linksCount: 0,
        filesCount: 0,
        detectedFrameworks,
        scrapingMode,
        extractionSuccess: false,
        error: error instanceof Error ? error.message : 'Erreur extraction contenu',
      },
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
