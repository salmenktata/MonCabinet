/**
 * Profils de configuration optimisés pour différents types de sites
 * Auto-détection et application des meilleurs paramètres selon le CMS/plateforme
 */

export type SiteType =
  | 'blogger'
  | 'wordpress'
  | 'typo3'
  | 'drupal'
  | 'joomla'
  | 'static'
  | 'spa'
  | 'unknown'

export interface CrawlerProfile {
  name: string
  description: string
  useSitemap: boolean
  requiresJavascript: boolean
  timeoutMs: number
  maxPages: number
  followLinks: boolean
  urlPatterns: string[]
  excludedPatterns: string[]
  concurrency: number
  rateLimit: number // ms entre les requêtes
  userAgent?: string
  customHeaders?: Record<string, string>
  /** Stratégie de fetch: 'static' (rapide) ou 'dynamic' (Playwright) */
  fetchStrategy: 'static' | 'dynamic' | 'adaptive'
  /** Sélecteurs CSS pour extraction de contenu */
  contentSelectors?: {
    main?: string[]
    title?: string[]
    date?: string[]
    author?: string[]
  }
}

/**
 * Profil optimisé pour les sites Blogger
 * Ex: da5ira.com, blogspot.com
 */
export const BLOGGER_PROFILE: CrawlerProfile = {
  name: 'Blogger',
  description: 'Sites hébergés sur Blogger/Blogspot',
  useSitemap: true, // CRITIQUE: évite timeout sur homepage
  requiresJavascript: false, // HTML statique
  timeoutMs: 60000, // 60s pour pages avec beaucoup d'images
  maxPages: 2000, // Blogger peut avoir beaucoup d'articles (da5ira = 1367)
  followLinks: true,
  urlPatterns: [
    '/20\\d{2}/', // URLs avec années 2000-2099
    '/p/',        // Pages statiques
  ],
  excludedPatterns: [
    // ⚠️ Ces patterns sont des regex (pas des globs) — traités via new RegExp(p)
    '\\.html\\?m=1',           // URLs mobiles Blogger (?m=1)
    '\\.html#',                // Ancres fragment (#)
    '\\.html\\?showComment=',  // Formulaires de commentaires
    '/search/label/',          // Pages de catégories (contenu dupliqué)
  ],
  concurrency: 3, // Blogger supporte bien la concurrence
  rateLimit: 500, // 500ms entre requêtes
  fetchStrategy: 'static',
  contentSelectors: {
    main: ['.post-body', 'article', '.entry-content'],
    title: ['.post-title', 'h1.entry-title', 'h2.entry-title'],
    date: ['.published', 'time', '.post-timestamp'],
    author: ['.author', '.post-author'],
  },
}

/**
 * Profil optimisé pour WordPress
 */
export const WORDPRESS_PROFILE: CrawlerProfile = {
  name: 'WordPress',
  description: 'Sites WordPress standard',
  useSitemap: true, // wp-sitemap.xml ou sitemap_index.xml
  requiresJavascript: false,
  timeoutMs: 45000,
  maxPages: 1000,
  followLinks: true,
  urlPatterns: [
    '/*/*/', // Structure /category/post/
    '/20*/', // Archives par année
  ],
  excludedPatterns: [
    '/wp-admin/*',
    '/wp-login.php',
    '/feed/',
    '/trackback/',
    '?replytocom=*',
    '/page/*', // Pagination (souvent dupliquée)
  ],
  concurrency: 5,
  rateLimit: 300,
  fetchStrategy: 'static',
  contentSelectors: {
    main: ['.entry-content', 'article', '.post-content', '.content'],
    title: ['.entry-title', 'h1.post-title', 'h1'],
    date: ['.entry-date', 'time.published', '.post-date'],
    author: ['.author.vcard', '.post-author'],
  },
}

/**
 * Profil optimisé pour TYPO3
 * Ex: cassation.tn
 */
export const TYPO3_PROFILE: CrawlerProfile = {
  name: 'TYPO3',
  description: 'CMS TYPO3',
  useSitemap: false, // Pas de sitemap standard
  requiresJavascript: true, // Souvent du JS pour navigation
  timeoutMs: 90000, // 90s pour formulaires complexes
  maxPages: 500,
  followLinks: true,
  urlPatterns: [
    '/index.php?id=*',
    '/tx_*', // Extensions TYPO3
  ],
  excludedPatterns: [
    '*cHash=*', // Cache hash (dupliqués)
    '/typo3/*', // Backend
    '/fileadmin/*', // Fichiers
  ],
  concurrency: 2, // TYPO3 peut être lent
  rateLimit: 1000, // 1s entre requêtes
  fetchStrategy: 'dynamic',
  contentSelectors: {
    main: ['#content', '.main-content', 'article'],
  },
}

/**
 * Profil pour sites statiques rapides
 */
export const STATIC_PROFILE: CrawlerProfile = {
  name: 'Static',
  description: 'Sites HTML statiques',
  useSitemap: true,
  requiresJavascript: false,
  timeoutMs: 30000,
  maxPages: 1000,
  followLinks: true,
  urlPatterns: [],
  excludedPatterns: [
    '*.pdf',
    '*.jpg',
    '*.png',
    '*.zip',
  ],
  concurrency: 10, // Très rapide
  rateLimit: 200,
  fetchStrategy: 'static',
}

/**
 * Profil pour Single Page Apps (React, Vue, Angular)
 * Ex: 9anoun.tn (Livewire/Laravel)
 */
export const SPA_PROFILE: CrawlerProfile = {
  name: 'SPA',
  description: 'Applications JavaScript (React, Vue, Livewire)',
  useSitemap: false, // Rarement disponible
  requiresJavascript: true, // OBLIGATOIRE
  timeoutMs: 120000, // 2min pour chargement complet
  maxPages: 500,
  followLinks: false, // Navigation souvent via JS
  urlPatterns: [],
  excludedPatterns: [
    '/api/*',
    '/_next/*',
    '/static/*',
  ],
  concurrency: 1, // Un seul à la fois (gourmand en ressources)
  rateLimit: 2000, // 2s entre requêtes
  fetchStrategy: 'dynamic',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
}

/**
 * Profil optimisé pour jibaya.tn (Direction Générale des Impôts — DGI Tunisie)
 *
 * Caractéristiques découvertes via benchmark (fév 2026) :
 * - WordPress avec 17 sous-sitemaps (1623 URLs total)
 * - Contenu en français (0% arabe dans les articles)
 * - PDFs avec polices custom (texte garbled) → OCR systématique obligatoire
 * - Sitemaps utiles : docs-sitemap.xml (798 docs), formulaire_a_telecha-sitemap.xml (258)
 * - Pages lentes : 2-3s/page → rate limit élevé nécessaire
 */
export const JIBAYA_PROFILE: CrawlerProfile = {
  name: 'Jibaya DGI',
  description: 'Site officiel DGI Tunisie (jibaya.tn) — WordPress, contenu fiscal français',
  useSitemap: true, // Sitemap riche : 17 sous-sitemaps
  requiresJavascript: false, // WordPress standard
  timeoutMs: 60000, // 60s/page (pages lentes)
  maxPages: 1000,
  followLinks: false, // On préfère le sitemap exhaustif
  urlPatterns: [
    '/docs/*',            // docs-sitemap : 798 documents
    '/formulaire*',       // formulaire_a_telecha-sitemap : 258 formulaires
    '/publication/*',
    '/depliant/*',
    '/revue_de_presse/*',
  ],
  excludedPatterns: [
    '/wp-admin/*',
    '/wp-login.php',
    '/feed/',
    '/blog/*',                    // Articles de blog (faible valeur KB)
    '/event/*',                   // Événements
    '/albums/*',                  // Albums photos
    '/carrousel*',                // Carrousels d'actualité
    '/tribe_events/*',            // Événements Tribe
    '/formulaire-a-telecha/*',    // Pages téléchargement PDF (6-8 mots, non indexables)
  ],
  concurrency: 2, // Pages lentes → limiter concurrence
  rateLimit: 1500, // 1.5s entre requêtes
  fetchStrategy: 'static',
  contentSelectors: {
    main: ['.entry-content', 'article', '.post-content', '.content', '.docs-content'],
    title: ['.entry-title', 'h1.post-title', 'h1'],
    date: ['.entry-date', 'time.published'],
  },
}

/**
 * Profil par défaut (conservateur)
 */
export const DEFAULT_PROFILE: CrawlerProfile = {
  name: 'Default',
  description: 'Configuration par défaut',
  useSitemap: true,
  requiresJavascript: false,
  timeoutMs: 45000,
  maxPages: 500,
  followLinks: true,
  urlPatterns: [],
  excludedPatterns: [
    '/admin/*',
    '/wp-admin/*',
    '/login*',
    '/logout*',
  ],
  concurrency: 3,
  rateLimit: 500,
  fetchStrategy: 'adaptive', // Teste static puis dynamic si échec
}

/**
 * Mapping des profils par type
 */
export const CRAWLER_PROFILES: Record<SiteType, CrawlerProfile> = {
  blogger: BLOGGER_PROFILE,
  wordpress: WORDPRESS_PROFILE,
  typo3: TYPO3_PROFILE,
  drupal: WORDPRESS_PROFILE, // Similar à WordPress
  joomla: WORDPRESS_PROFILE, // Similar à WordPress
  static: STATIC_PROFILE,
  spa: SPA_PROFILE,
  unknown: DEFAULT_PROFILE,
}

/**
 * Patterns de détection par type de CMS
 */
export const DETECTION_PATTERNS: Record<SiteType, {
  urlPatterns: RegExp[]
  htmlSignatures: string[]
  headers?: string[]
}> = {
  blogger: {
    urlPatterns: [
      /blogspot\.com/i,
      /blogger\.com/i,
    ],
    htmlSignatures: [
      'blogger',
      'blogspot',
      '<b:skin>',
      'blogger-clickTrap',
    ],
    headers: ['X-Blogger'],
  },
  wordpress: {
    urlPatterns: [
      /\/wp-content\//i,
      /\/wp-includes\//i,
    ],
    htmlSignatures: [
      'wp-content',
      'wp-includes',
      'WordPress',
      'wp-json',
    ],
    headers: ['X-Powered-By: PHP'],
  },
  typo3: {
    urlPatterns: [
      /index\.php\?id=/i,
      /\/typo3\//i,
    ],
    htmlSignatures: [
      'typo3',
      'TYPO3',
      'tx_',
      'This website is powered by TYPO3',
    ],
  },
  drupal: {
    urlPatterns: [
      /\/node\//i,
      /\/sites\/default\//i,
    ],
    htmlSignatures: [
      'Drupal',
      'drupal',
      '/sites/default/',
    ],
  },
  joomla: {
    urlPatterns: [
      /option=com_/i,
      /\/components\//i,
    ],
    htmlSignatures: [
      'Joomla',
      'com_content',
    ],
  },
  spa: {
    urlPatterns: [
      /#\//i, // Hash routing
    ],
    htmlSignatures: [
      'react',
      'vue',
      'angular',
      'livewire',
      '__NEXT_DATA__',
      'ng-app',
    ],
  },
  static: {
    urlPatterns: [],
    htmlSignatures: [],
  },
  unknown: {
    urlPatterns: [],
    htmlSignatures: [],
  },
}

/**
 * Obtenir le profil recommandé pour un domaine
 */
export function getRecommendedProfile(url: string, htmlSample?: string): CrawlerProfile {
  // Détection par URL
  for (const [type, patterns] of Object.entries(DETECTION_PATTERNS)) {
    if (patterns.urlPatterns.some(pattern => pattern.test(url))) {
      return CRAWLER_PROFILES[type as SiteType]
    }
  }

  // Détection par HTML si disponible
  if (htmlSample) {
    const lowerHtml = htmlSample.toLowerCase()
    for (const [type, patterns] of Object.entries(DETECTION_PATTERNS)) {
      if (patterns.htmlSignatures.some(sig => lowerHtml.includes(sig.toLowerCase()))) {
        return CRAWLER_PROFILES[type as SiteType]
      }
    }
  }

  // Par défaut
  return DEFAULT_PROFILE
}

/**
 * Optimiser une source existante avec le bon profil
 */
export function optimizeSourceConfig(
  baseUrl: string,
  currentConfig: Partial<CrawlerProfile>,
  htmlSample?: string
): Partial<CrawlerProfile> {
  const recommendedProfile = getRecommendedProfile(baseUrl, htmlSample)

  // Merger la config actuelle avec le profil recommandé
  return {
    ...recommendedProfile,
    ...currentConfig, // Garder les overrides manuels
  }
}
