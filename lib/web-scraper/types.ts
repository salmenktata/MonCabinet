/**
 * Types pour le système d'ingestion web
 */

import type { WebSourceCategory } from '@/lib/categories/legal-categories'
import { LEGAL_CATEGORY_TRANSLATIONS } from '@/lib/categories/legal-categories'

// Re-export pour rétrocompatibilité
export type { WebSourceCategory }

/**
 * Mapping des catégories arabe <-> français
 * @deprecated Utiliser LEGAL_CATEGORY_TRANSLATIONS depuis @/lib/categories/legal-categories
 */
export const CATEGORY_TRANSLATIONS = LEGAL_CATEGORY_TRANSLATIONS

export type WebSourceLanguage = 'ar' | 'fr' | 'mixed'

export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'unknown'

export type PageStatus =
  | 'pending'
  | 'crawled'
  | 'indexed'
  | 'failed'
  | 'unchanged'
  | 'removed'
  | 'blocked'

export type CrawlJobType = 'full_crawl' | 'incremental' | 'single_page' | 'reindex'

export type CrawlJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface CssSelectors {
  content?: string[]
  exclude?: string[]
  title?: string
  author?: string
  date?: string
  description?: string
}

/**
 * Configuration d'extraction personnalisée par source
 * Permet de configurer le filtrage du bruit et l'extraction du contenu
 */
export interface ExtractionConfig {
  /** Patterns de texte à supprimer (regex strings) */
  noisePatterns?: string[]
  /** Sélecteurs CSS des éléments à supprimer */
  removeSelectors?: string[]
  /** Sélecteur du contenu juridique principal */
  legalContentSelector?: string
  /** Sélecteur du numéro d'article/فصل */
  articleNumberSelector?: string
  /** Sélecteur du titre du code/مجلة */
  codeNameSelector?: string
  /** Sélecteur du texte de l'article */
  articleTextSelector?: string
  /** Préserver la structure hiérarchique (باب، قسم، فصل) */
  preserveHierarchy?: boolean
  /** Sélecteurs de la hiérarchie */
  hierarchySelectors?: {
    book?: string      // كتاب
    part?: string      // باب
    chapter?: string   // قسم
    section?: string   // فرع
    article?: string   // فصل
  }
  /** Extraire les notes et commentaires */
  extractNotes?: boolean
  /** Sélecteur des notes/تعليقات */
  notesSelector?: string
  /** Langue principale du contenu */
  contentLanguage?: 'ar' | 'fr' | 'mixed'
}

/**
 * Contenu juridique structuré extrait
 */
export interface StructuredLegalContent {
  /** Numéro de l'article (ex: "1", "142 مكرر") */
  articleNumber?: string
  /** Texte principal de l'article */
  articleText: string
  /** Nom du code parent */
  codeName?: string
  /** Hiérarchie complète */
  hierarchy?: {
    book?: string      // الكتاب
    part?: string      // الباب
    chapter?: string   // القسم
    section?: string   // الفرع
  }
  /** Notes et commentaires */
  notes?: string[]
  /** Références à d'autres articles */
  references?: string[]
  /** Date de dernière modification */
  lastModified?: string
  /** Version du texte */
  version?: string
}

/**
 * Configuration pour la découverte automatique de liens dynamiques
 */
export interface LinkDiscoveryConfig {
  /** Activer la découverte de liens (défaut: true pour sites dynamiques) */
  enabled: boolean
  /** Sélecteurs CSS des éléments à cliquer pour révéler des liens */
  clickSelectors: string[]
  /** Nombre maximum de clics à effectuer */
  maxClicks: number
  /** Délai d'attente après chaque clic (ms) */
  waitAfterClickMs: number
  /** Timeout global pour la phase de découverte (ms) */
  discoveryTimeoutMs: number
  /** Stratégie de capture des URLs */
  captureStrategy: 'dom' | 'history' | 'xhr' | 'hybrid'
  /** Utiliser le scoring de pertinence pour prioriser les clics */
  useRelevanceScoring?: boolean
  /** Patterns à exclure (logout, admin, etc.) */
  excludePatterns?: string[]
}

/**
 * Configuration avancée pour les sites dynamiques
 * (Livewire, React, Vue, Angular, etc.)
 */
export interface DynamicSiteConfig {
  /** Sélecteur CSS à attendre avant d'extraire le contenu */
  waitForSelector?: string
  /** Délai supplémentaire après chargement (ms) */
  postLoadDelayMs?: number
  /** Scroller la page pour déclencher le lazy loading */
  scrollToLoad?: boolean
  /** Nombre de scrolls à effectuer */
  scrollCount?: number
  /** Attendre la disparition des indicateurs de chargement */
  waitForLoadingToDisappear?: boolean
  /** Sélecteurs des indicateurs de chargement à surveiller */
  loadingIndicators?: string[]
  /** Cliquer sur un élément avant l'extraction (ex: "Voir plus") */
  clickBeforeExtract?: string[]
  /** Exécuter du JavaScript personnalisé avant extraction */
  customScript?: string
  /** Mode d'attente: 'networkidle' | 'domcontentloaded' | 'load' */
  waitUntil?: 'networkidle' | 'domcontentloaded' | 'load'
  /** Timeout spécifique pour le chargement dynamique (ms) */
  dynamicTimeoutMs?: number
  /** Configuration de découverte automatique de liens */
  linkDiscoveryConfig?: LinkDiscoveryConfig
}

/**
 * Configuration pour le crawl de formulaires (ex: TYPO3 cassation.tn)
 */
export interface FormCrawlConfig {
  /** Type de formulaire/CMS (extensible) */
  type: 'typo3-cassation' | 'webdev-iort'
  /** Sous-ensemble de thèmes à crawler (tous si absent) */
  themes?: string[]
}

export interface WebSource {
  id: string
  name: string
  baseUrl: string
  description: string | null
  faviconUrl: string | null

  // Classification
  category: WebSourceCategory
  language: WebSourceLanguage
  priority: number

  // Configuration Crawl
  crawlFrequency: string // PostgreSQL interval as string
  adaptiveFrequency: boolean
  cssSelectors: CssSelectors
  urlPatterns: string[]
  excludedPatterns: string[]
  maxDepth: number
  maxPages: number
  followLinks: boolean
  downloadFiles: boolean

  // Seed URLs (pages d'entrée supplémentaires au-delà de baseUrl)
  seedUrls: string[]

  // Configuration crawl de formulaires (POST avec CSRF, etc.)
  formCrawlConfig: FormCrawlConfig | null

  // Configuration Technique
  requiresJavascript: boolean
  userAgent: string
  rateLimitMs: number
  timeoutMs: number
  respectRobotsTxt: boolean
  customHeaders: Record<string, string>

  // Protection anti-bannissement
  stealthMode?: boolean              // Mode stealth (User-Agent réaliste)
  maxPagesPerHour?: number           // Quota horaire
  maxPagesPerDay?: number            // Quota journalier

  // SSL
  ignoreSSLErrors?: boolean          // Ignorer les certificats SSL invalides (sites gouvernementaux)

  // Auto-indexation des fichiers
  autoIndexFiles?: boolean           // Parser + indexer les PDFs automatiquement pendant le crawl

  // Whitelist domaines pour téléchargement PDFs (vide = aucune restriction)
  allowedPdfDomains: string[]        // Ex: ['legislation.tn', 'jort.gov.tn']

  // Configuration avancée pour sites dynamiques (Livewire, React, Vue, etc.)
  dynamicConfig: DynamicSiteConfig | null

  // Configuration d'extraction personnalisée (patterns de bruit, sélecteurs)
  extractionConfig: ExtractionConfig | null

  // Google Drive configuration (null pour sources web)
  driveConfig?: {
    folderId: string
    recursive: boolean
    fileTypes: ('pdf' | 'docx' | 'doc' | 'xlsx' | 'pptx')[]
    serviceAccountEmail?: string
  } | null

  // Sitemap & RSS
  sitemapUrl: string | null
  rssFeedUrl: string | null
  useSitemap: boolean

  // État
  isActive: boolean
  ragEnabled: boolean
  healthStatus: HealthStatus
  consecutiveFailures: number

  // Timestamps
  lastCrawlAt: Date | null
  lastSuccessfulCrawlAt: Date | null
  nextCrawlAt: Date | null

  // Statistiques
  totalPagesDiscovered: number
  totalPagesIndexed: number
  avgPagesPerCrawl: number
  avgCrawlDurationMs: number

  // Admin
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WebPage {
  id: string
  webSourceId: string
  url: string
  urlHash: string
  canonicalUrl: string | null

  // Contenu
  title: string | null
  contentHash: string | null
  extractedText: string | null
  wordCount: number
  languageDetected: string | null

  // Métadonnées
  metaDescription: string | null
  metaAuthor: string | null
  metaDate: Date | null
  metaKeywords: string[]
  structuredData: Record<string, unknown> | null

  // Fichiers liés
  linkedFiles: LinkedFile[]

  // Structure du site (pour classification)
  siteStructure: Record<string, unknown> | null

  // HTTP Caching
  etag: string | null
  lastModified: Date | null

  // État
  status: PageStatus
  errorMessage: string | null
  errorCount: number

  // Intégration KB
  knowledgeBaseId: string | null
  isIndexed: boolean
  chunksCount: number

  // Tracking
  crawlDepth: number
  firstSeenAt: Date
  lastCrawledAt: Date | null
  lastChangedAt: Date | null
  lastIndexedAt: Date | null
  freshnessScore: number

  createdAt: Date
  updatedAt: Date
}

export interface LinkedFile {
  url: string
  type: 'pdf' | 'docx' | 'doc' | 'xlsx' | 'xls' | 'pptx' | 'ppt' | 'image' | 'other'
  filename: string
  size?: number
  downloaded?: boolean
  minioPath?: string
  /** URL originale (avant transformation pour les liens cloud) */
  originalUrl?: string
  /** Source de détection: 'link' | 'iframe' | 'global' | 'gdrive' */
  source?: 'link' | 'iframe' | 'global' | 'gdrive'
}

export interface WebCrawlJob {
  id: string
  webSourceId: string
  jobType: CrawlJobType
  status: CrawlJobStatus
  priority: number
  params: Record<string, unknown>
  startedAt: Date | null
  completedAt: Date | null
  workerId: string | null
  pagesProcessed: number
  pagesNew: number
  pagesChanged: number
  pagesFailed: number
  filesDownloaded: number
  errors: CrawlError[]
  errorMessage: string | null
  createdAt: Date
}

export interface CrawlError {
  url: string
  error: string
  timestamp: string
}

/**
 * Fichier Google Drive découvert pendant le crawl
 */
export interface GoogleDriveFile {
  id: string
  name: string
  mimeType: string
  size: string
  modifiedTime: string
  webViewLink: string
  webContentLink?: string
}

export interface WebCrawlLog {
  id: string
  webSourceId: string
  jobId: string | null
  startedAt: Date
  completedAt: Date | null
  durationMs: number | null
  pagesCrawled: number
  pagesNew: number
  pagesChanged: number
  pagesUnchanged: number
  pagesFailed: number
  pagesSkipped: number
  filesDownloaded: number
  bytesDownloaded: number
  chunksCreated: number
  embeddingsGenerated: number
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  errorMessage: string | null
  errors: CrawlError[]
}

/**
 * Types de frameworks détectables
 */
export type DetectedFramework =
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
  | 'webdev'
  | 'static'

/**
 * Résultat du fetch HTTP/Playwright
 */
export interface FetchResult {
  success: boolean
  html?: string
  statusCode?: number
  error?: string
  finalUrl?: string
  etag?: string
  lastModified?: Date | null
  /** URLs découvertes via interaction JavaScript (menus, navigation) */
  discoveredUrls?: string[]
}

export interface ScrapedContent {
  url: string
  title: string
  content: string
  html: string
  description: string | null
  author: string | null
  date: Date | null
  keywords: string[]
  language: string | null
  links: string[]
  files: LinkedFile[]
  structuredData: Record<string, unknown> | null
  /** Contexte juridique extrait (type de document, code parent, etc.) */
  legalContext?: LegalContext
  /** Structure du site extraite (breadcrumbs, URL, navigation) */
  siteStructure?: SiteStructure
  /** Contenu juridique structuré (article, hiérarchie, références) */
  structuredLegalContent?: StructuredLegalContent
  /** Résultat du fetch avec métadonnées HTTP et URLs découvertes */
  fetchResult?: FetchResult
}

/**
 * Métriques de scraping pour monitoring
 */
export interface ScrapingMetrics {
  /** Temps total de scraping (ms) */
  totalTimeMs: number
  /** Temps de fetch HTTP/Playwright (ms) */
  fetchTimeMs: number
  /** Temps d'extraction du contenu (ms) */
  extractionTimeMs: number
  /** Taille du HTML brut (bytes) */
  htmlSizeBytes: number
  /** Taille du contenu extrait (caractères) */
  contentLength: number
  /** Nombre de liens extraits */
  linksCount: number
  /** Nombre de fichiers détectés */
  filesCount: number
  /** Framework(s) détecté(s) */
  detectedFrameworks: string[]
  /** Mode de scraping utilisé */
  scrapingMode: 'static' | 'dynamic'
  /** Succès de l'extraction */
  extractionSuccess: boolean
  /** Erreur éventuelle */
  error?: string
  /** Qualité du contenu (0-100) */
  contentQualityScore?: number
}

export interface CrawlResult {
  success: boolean
  pagesProcessed: number
  pagesNew: number
  pagesChanged: number
  pagesFailed: number
  filesDownloaded: number
  errors: CrawlError[]
}

export interface RobotsRules {
  allowed: boolean
  crawlDelay: number | null
  sitemaps: string[]
  disallowedPaths: string[]
}

export interface WebSourceStats {
  totalSources: number
  activeSources: number
  healthySources: number
  failingSources: number
  totalPages: number
  indexedPages: number
  pendingJobs: number
  runningJobs: number
  byCategory: Record<WebSourceCategory, number>
}

export interface CreateWebSourceInput {
  name: string
  baseUrl: string
  description?: string
  category: WebSourceCategory
  language?: WebSourceLanguage
  priority?: number
  crawlFrequency?: string
  maxDepth?: number
  maxPages?: number
  requiresJavascript?: boolean
  cssSelectors?: CssSelectors
  urlPatterns?: string[]
  excludedPatterns?: string[]
  sitemapUrl?: string
  rssFeedUrl?: string
  useSitemap?: boolean
  downloadFiles?: boolean
  respectRobotsTxt?: boolean
  rateLimitMs?: number
  customHeaders?: Record<string, string>
  dynamicConfig?: DynamicSiteConfig
  extractionConfig?: ExtractionConfig
  ignoreSSLErrors?: boolean
  seedUrls?: string[]
  formCrawlConfig?: FormCrawlConfig
  autoIndexFiles?: boolean
  allowedPdfDomains?: string[]
  driveConfig?: {
    folderId: string
    recursive: boolean
    fileTypes: string[]
    serviceAccountEmail?: string
  } | null
}


export interface UpdateWebSourceInput {
  name?: string
  baseUrl?: string
  description?: string
  category?: WebSourceCategory
  language?: WebSourceLanguage
  priority?: number
  crawlFrequency?: string
  maxDepth?: number
  maxPages?: number
  requiresJavascript?: boolean
  cssSelectors?: CssSelectors
  urlPatterns?: string[]
  excludedPatterns?: string[]
  sitemapUrl?: string
  rssFeedUrl?: string
  useSitemap?: boolean
  downloadFiles?: boolean
  respectRobotsTxt?: boolean
  rateLimitMs?: number
  customHeaders?: Record<string, string>
  dynamicConfig?: DynamicSiteConfig
  extractionConfig?: ExtractionConfig
  isActive?: boolean
  ragEnabled?: boolean
  ignoreSSLErrors?: boolean
  seedUrls?: string[]
  formCrawlConfig?: FormCrawlConfig | null
  autoIndexFiles?: boolean
  allowedPdfDomains?: string[]
}

// ============================================================================
// TYPES POUR LE SYSTÈME INTELLIGENT DE TRAITEMENT DU CONTENU
// ============================================================================

/**
 * Statut de traitement dans le pipeline intelligent
 */
export type ProcessingStatus =
  | 'pending'
  | 'analyzed'
  | 'classified'
  | 'validated'
  | 'rejected'

/**
 * Domaines juridiques tunisiens
 * Avec traductions arabe <-> français
 */
export type LegalDomain =
  | 'civil'                    // القانون المدني - Droit civil
  | 'commercial'               // القانون التجاري - Droit commercial
  | 'penal'                    // القانون الجزائي - Droit pénal
  | 'famille'                  // قانون الأسرة - Droit de la famille
  | 'fiscal'                   // القانون الجبائي - Droit fiscal
  | 'social'                   // القانون الاجتماعي - Droit social/travail
  | 'administratif'            // القانون الإداري - Droit administratif
  | 'constitutionnel'          // القانون الدستوري - Droit constitutionnel
  | 'immobilier'               // القانون العقاري - Droit immobilier
  | 'bancaire'                 // القانون البنكي - Droit bancaire
  | 'assurance'                // قانون التأمين - Droit des assurances
  | 'douanier'                 // القانون الديواني - Droit douanier
  | 'propriete_intellectuelle' // الملكية الفكرية - Propriété intellectuelle
  | 'environnement'            // قانون البيئة - Droit de l'environnement
  | 'maritime'                 // القانون البحري - Droit maritime
  | 'aerien'                   // القانون الجوي - Droit aérien
  | 'numerique'                // القانون الرقمي - Droit numérique
  | 'consommation'             // قانون الاستهلاك - Droit de la consommation
  | 'concurrence'              // قانون المنافسة - Droit de la concurrence
  | 'international_prive'      // القانون الدولي الخاص - Droit international privé
  | 'international_public'     // القانون الدولي العام - Droit international public
  | 'humanitaire'              // القانون الإنساني - Droit humanitaire
  | 'procedure_civile'         // الإجراءات المدنية - Procédure civile
  | 'procedure_penale'         // الإجراءات الجزائية - Procédure pénale
  | 'arbitrage'                // التحكيم - Arbitrage
  | 'societes'                 // قانون الشركات - Droit des sociétés
  | 'donnees_personnelles'     // حماية المعطيات الشخصية - Protection des données personnelles
  | 'energie'                  // قانون الطاقة - Droit de l'énergie
  | 'autre'                    // أخرى - Autre

/**
 * Mapping des domaines juridiques arabe <-> français
 */
export const LEGAL_DOMAIN_TRANSLATIONS: Record<LegalDomain, { ar: string; fr: string }> = {
  civil: { ar: 'القانون المدني', fr: 'Droit civil' },
  commercial: { ar: 'القانون التجاري', fr: 'Droit commercial' },
  penal: { ar: 'القانون الجزائي', fr: 'Droit pénal' },
  famille: { ar: 'قانون الأسرة', fr: 'Droit de la famille' },
  fiscal: { ar: 'القانون الجبائي', fr: 'Droit fiscal' },
  social: { ar: 'القانون الاجتماعي', fr: 'Droit social/travail' },
  administratif: { ar: 'القانون الإداري', fr: 'Droit administratif' },
  constitutionnel: { ar: 'القانون الدستوري', fr: 'Droit constitutionnel' },
  immobilier: { ar: 'القانون العقاري', fr: 'Droit immobilier' },
  bancaire: { ar: 'القانون البنكي', fr: 'Droit bancaire' },
  assurance: { ar: 'قانون التأمين', fr: 'Droit des assurances' },
  douanier: { ar: 'القانون الديواني', fr: 'Droit douanier' },
  propriete_intellectuelle: { ar: 'الملكية الفكرية', fr: 'Propriété intellectuelle' },
  environnement: { ar: 'قانون البيئة', fr: "Droit de l'environnement" },
  maritime: { ar: 'القانون البحري', fr: 'Droit maritime' },
  aerien: { ar: 'القانون الجوي', fr: 'Droit aérien' },
  numerique: { ar: 'القانون الرقمي', fr: 'Droit numérique' },
  consommation: { ar: 'قانون الاستهلاك', fr: 'Droit de la consommation' },
  concurrence: { ar: 'قانون المنافسة', fr: 'Droit de la concurrence' },
  international_prive: { ar: 'القانون الدولي الخاص', fr: 'Droit international privé' },
  international_public: { ar: 'القانون الدولي العام', fr: 'Droit international public' },
  humanitaire: { ar: 'القانون الإنساني', fr: 'Droit humanitaire' },
  procedure_civile: { ar: 'الإجراءات المدنية', fr: 'Procédure civile' },
  procedure_penale: { ar: 'الإجراءات الجزائية', fr: 'Procédure pénale' },
  arbitrage: { ar: 'التحكيم', fr: 'Arbitrage' },
  societes: { ar: 'قانون الشركات', fr: 'Droit des sociétés' },
  donnees_personnelles: { ar: 'حماية المعطيات الشخصية', fr: 'Protection des données personnelles' },
  energie: { ar: 'قانون الطاقة', fr: "Droit de l'énergie" },
  autre: { ar: 'أخرى', fr: 'Autre' },
}

/**
 * Catégories de contenu juridique (étendu)
 * @deprecated Utiliser LegalContentCategory depuis @/lib/categories/legal-categories
 */
import type { LegalContentCategory as _LegalContentCategory } from '@/lib/categories/legal-categories'
export type LegalContentCategory = _LegalContentCategory

/**
 * Nature des documents juridiques
 * Avec traductions arabe <-> français
 */
export type DocumentNature =
  // Législation
  | 'loi'                  // قانون - Loi
  | 'loi_organique'        // قانون أساسي - Loi organique
  | 'loi_constitutionnelle' // قانون دستوري - Loi constitutionnelle
  | 'decret'               // أمر / مرسوم - Décret
  | 'decret_gouvernemental' // أمر حكومي - Décret gouvernemental
  | 'decret_presidentiel'  // أمر رئاسي - Décret présidentiel
  | 'decret_loi'           // مرسوم - Décret-loi
  | 'arrete'               // قرار - Arrêté
  | 'arrete_ministeriel'   // قرار وزاري - Arrêté ministériel
  | 'arrete_conjoint'      // قرار مشترك - Arrêté conjoint
  | 'circulaire'           // منشور - Circulaire
  | 'ordonnance'           // أمر قانوني - Ordonnance
  | 'note_generale'        // مذكرة عامة - Note générale
  // Jurisprudence
  | 'arret'                // قرار - Arrêt
  | 'arret_cassation'      // قرار تعقيب - Arrêt de cassation
  | 'arret_appel'          // قرار استئناف - Arrêt d'appel
  | 'jugement'             // حكم - Jugement
  | 'ordonnance_jud'       // أمر على عريضة - Ordonnance sur requête
  | 'ordonnance_refere'    // أمر استعجالي - Ordonnance de référé
  | 'avis'                 // رأي - Avis
  | 'avis_juridique'       // رأي قانوني - Avis juridique
  // Doctrine
  | 'article_doctrine'     // مقال فقهي - Article de doctrine
  | 'these'                // أطروحة - Thèse
  | 'memoire'              // رسالة - Mémoire
  | 'commentaire'          // تعليق - Commentaire
  | 'note'                 // تعليقة - Note
  | 'chronique'            // حولية - Chronique
  // Pratique
  | 'modele_contrat'       // نموذج عقد - Modèle de contrat
  | 'modele_acte'          // نموذج محرر - Modèle d'acte
  | 'formulaire'           // استمارة - Formulaire
  | 'guide_pratique'       // دليل عملي - Guide pratique
  | 'faq'                  // أسئلة شائعة - FAQ
  // Constitutionnel
  | 'constitution'         // دستور - Constitution
  | 'amendement_const'     // تعديل دستوري - Amendement constitutionnel
  // International
  | 'convention'           // اتفاقية - Convention
  | 'traite'               // معاهدة - Traité
  | 'protocole'            // بروتوكول - Protocole
  | 'accord'               // اتفاق - Accord
  // JORT
  | 'jort_publication'     // نشر بالرائد الرسمي - Publication au JORT
  // Autres
  | 'actualite'            // خبر - Actualité
  | 'autre'                // أخرى - Autre

/**
 * Mapping des natures de documents arabe <-> français
 */
export const DOCUMENT_NATURE_TRANSLATIONS: Record<DocumentNature, { ar: string; fr: string }> = {
  // Législation
  loi: { ar: 'قانون', fr: 'Loi' },
  loi_organique: { ar: 'قانون أساسي', fr: 'Loi organique' },
  loi_constitutionnelle: { ar: 'قانون دستوري', fr: 'Loi constitutionnelle' },
  decret: { ar: 'أمر', fr: 'Décret' },
  decret_gouvernemental: { ar: 'أمر حكومي', fr: 'Décret gouvernemental' },
  decret_presidentiel: { ar: 'أمر رئاسي', fr: 'Décret présidentiel' },
  decret_loi: { ar: 'مرسوم', fr: 'Décret-loi' },
  arrete: { ar: 'قرار', fr: 'Arrêté' },
  arrete_ministeriel: { ar: 'قرار وزاري', fr: 'Arrêté ministériel' },
  arrete_conjoint: { ar: 'قرار مشترك', fr: 'Arrêté conjoint' },
  circulaire: { ar: 'منشور', fr: 'Circulaire' },
  ordonnance: { ar: 'أمر قانوني', fr: 'Ordonnance' },
  note_generale: { ar: 'مذكرة عامة', fr: 'Note générale' },
  // Jurisprudence
  arret: { ar: 'قرار', fr: 'Arrêt' },
  arret_cassation: { ar: 'قرار تعقيب', fr: 'Arrêt de cassation' },
  arret_appel: { ar: 'قرار استئناف', fr: "Arrêt d'appel" },
  jugement: { ar: 'حكم', fr: 'Jugement' },
  ordonnance_jud: { ar: 'أمر على عريضة', fr: 'Ordonnance sur requête' },
  ordonnance_refere: { ar: 'أمر استعجالي', fr: 'Ordonnance de référé' },
  avis: { ar: 'رأي', fr: 'Avis' },
  avis_juridique: { ar: 'رأي قانوني', fr: 'Avis juridique' },
  // Doctrine
  article_doctrine: { ar: 'مقال فقهي', fr: 'Article de doctrine' },
  these: { ar: 'أطروحة', fr: 'Thèse' },
  memoire: { ar: 'رسالة', fr: 'Mémoire' },
  commentaire: { ar: 'تعليق', fr: 'Commentaire' },
  note: { ar: 'تعليقة', fr: 'Note' },
  chronique: { ar: 'حولية', fr: 'Chronique' },
  // Pratique
  modele_contrat: { ar: 'نموذج عقد', fr: 'Modèle de contrat' },
  modele_acte: { ar: 'نموذج محرر', fr: "Modèle d'acte" },
  formulaire: { ar: 'استمارة', fr: 'Formulaire' },
  guide_pratique: { ar: 'دليل عملي', fr: 'Guide pratique' },
  faq: { ar: 'أسئلة شائعة', fr: 'FAQ' },
  // Constitutionnel
  constitution: { ar: 'دستور', fr: 'Constitution' },
  amendement_const: { ar: 'تعديل دستوري', fr: 'Amendement constitutionnel' },
  // International
  convention: { ar: 'اتفاقية', fr: 'Convention' },
  traite: { ar: 'معاهدة', fr: 'Traité' },
  protocole: { ar: 'بروتوكول', fr: 'Protocole' },
  accord: { ar: 'اتفاق', fr: 'Accord' },
  // JORT
  jort_publication: { ar: 'نشر بالرائد الرسمي', fr: 'Publication au JORT' },
  // Autres
  actualite: { ar: 'خبر', fr: 'Actualité' },
  autre: { ar: 'أخرى', fr: 'Autre' },
}

/**
 * Types de contradictions détectées
 */
export type ContradictionType =
  | 'version_conflict'
  | 'interpretation_conflict'
  | 'date_conflict'
  | 'legal_update'
  | 'doctrine_vs_practice'
  | 'cross_reference_error'

/**
 * Sévérité des contradictions
 */
export type ContradictionSeverity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Statut de résolution des contradictions
 */
export type ContradictionStatus =
  | 'pending'
  | 'under_review'
  | 'resolved'
  | 'dismissed'
  | 'escalated'

/**
 * Types de revue humaine
 */
export type ReviewType =
  | 'classification_uncertain'
  | 'quality_low'
  | 'contradiction_detected'
  | 'content_ambiguous'
  | 'source_reliability'
  | 'legal_update_detected'
  | 'duplicate_suspected'
  | 'manual_request'

/**
 * Type de cible pour la revue
 */
export type ReviewTargetType =
  | 'web_page'
  | 'contradiction'
  | 'classification'
  | 'quality_assessment'

/**
 * Priorité de la revue
 */
export type ReviewPriority = 'low' | 'normal' | 'high' | 'urgent'

/**
 * Statut de la revue
 */
export type ReviewStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'expired'

/**
 * Décision de revue
 */
export type ReviewDecision =
  | 'approve'
  | 'reject'
  | 'modify'
  | 'escalate'
  | 'defer'

/**
 * Évaluation de la qualité du contenu
 */
export interface ContentQualityAssessment {
  id: string
  webPageId: string

  // Scores (0-100)
  overallScore: number
  clarityScore: number | null
  structureScore: number | null
  completenessScore: number | null
  reliabilityScore: number | null
  freshnessScore: number | null
  relevanceScore: number | null

  // Analyse LLM
  analysisSummary: string | null
  detectedIssues: string[]
  recommendations: string[]

  // Métadonnées juridiques extraites
  legalReferences: LegalReference[]
  documentDate: Date | null
  documentTypeDetected: string | null
  jurisdiction: string | null

  // État
  requiresReview: boolean
  reviewReason: string | null

  // LLM utilisé
  llmProvider: string | null
  llmModel: string | null
  tokensUsed: number | null
  processingTimeMs: number | null

  assessedAt: Date
}

/**
 * Référence légale extraite
 */
export interface LegalReference {
  type: 'law' | 'decree' | 'article' | 'case' | 'jort' | 'other'
  reference: string
  date?: string
  description?: string
}

/**
 * Contexte juridique extrait de la page
 * Permet de comprendre la hiérarchie du document (ex: article dans un code)
 */
export interface LegalContext {
  /** Type de document détecté */
  documentType: 'code' | 'code_article' | 'law' | 'decree' | 'convention' | 'jurisprudence' | 'jort' | 'constitution' | 'unknown'
  /** Code parent (si c'est un article de code) */
  parentCode?: {
    nameAr: string     // Ex: مجلة الالتزامات والعقود
    nameFr?: string    // Ex: Code des Obligations et Contrats
    slug?: string      // Ex: code-obligations-contrats
  }
  /** Numéro d'article/فصل (si c'est un article) */
  articleNumber?: string  // Ex: 3, 142-bis, مكرر
  /** Chapitre/باب (si applicable) */
  chapter?: string
  /** Section/قسم (si applicable) */
  section?: string
  /** Livre/كتاب (si applicable) */
  book?: string
  /** Titre/عنوان (si applicable) */
  title?: string
}

/**
 * Mapping des codes tunisiens avec leurs noms AR/FR et slugs
 * Re-export enrichi depuis 9anoun-code-domains.ts (50+ codes au lieu de 14)
 */
import { NINEANOUN_CODE_DOMAINS } from './9anoun-code-domains'

export const TUNISIAN_CODES: Record<string, { ar: string; fr: string; domain: LegalDomain }> =
  Object.fromEntries(
    Object.entries(NINEANOUN_CODE_DOMAINS).map(([slug, def]) => [
      slug,
      { ar: def.nameAr, fr: def.nameFr, domain: def.domain },
    ])
  )

/**
 * Classification juridique du contenu
 */
export interface LegalClassification {
  id: string
  webPageId: string

  // Classification principale
  primaryCategory: LegalContentCategory
  subcategory: string | null
  domain: LegalDomain | null
  subdomain: string | null
  documentNature: DocumentNature | null

  // Confiance
  confidenceScore: number
  requiresValidation: boolean
  validationReason: string | null
  alternativeClassifications: AlternativeClassification[]

  // Mots-clés juridiques
  legalKeywords: string[]

  // Validation humaine
  validatedBy: string | null
  validatedAt: Date | null
  finalClassification: FinalClassification | null
  validationNotes: string | null

  // LLM utilisé
  llmProvider: string | null
  llmModel: string | null
  tokensUsed: number | null

  classifiedAt: Date
}

/**
 * Classification alternative proposée
 */
export interface AlternativeClassification {
  category: LegalContentCategory
  domain: LegalDomain | null
  confidence: number
  reason?: string
}

/**
 * Classification finale après validation
 */
export interface FinalClassification {
  primaryCategory: LegalContentCategory
  subcategory?: string
  domain?: LegalDomain
  subdomain?: string
  documentNature?: DocumentNature
  modifiedBy: string
  modifiedAt: string
}

/**
 * Contradiction détectée entre contenus
 */
export interface ContentContradiction {
  id: string
  sourcePageId: string
  targetPageId: string | null

  // Type et sévérité
  contradictionType: ContradictionType
  severity: ContradictionSeverity

  // Description
  description: string
  sourceExcerpt: string | null
  targetExcerpt: string | null

  // Analyse
  similarityScore: number | null
  legalImpact: string | null
  suggestedResolution: string | null

  // Références affectées
  affectedReferences: LegalReference[]

  // État de résolution
  status: ContradictionStatus
  resolutionNotes: string | null
  resolvedBy: string | null
  resolvedAt: Date | null
  resolutionAction: string | null

  // LLM utilisé
  llmProvider: string | null
  llmModel: string | null

  createdAt: Date
  updatedAt: Date
}

/**
 * Item dans la queue de revue humaine
 */
export interface HumanReviewItem {
  id: string
  reviewType: ReviewType
  targetType: ReviewTargetType
  targetId: string

  // Contexte
  title: string
  description: string | null
  context: Record<string, unknown>
  suggestedActions: SuggestedAction[]

  // Scores
  qualityScore: number | null
  confidenceScore: number | null

  // Priorité et statut
  priority: ReviewPriority
  status: ReviewStatus

  // Attribution
  assignedTo: string | null
  assignedAt: Date | null

  // Décision
  decision: ReviewDecision | null
  decisionNotes: string | null
  modificationsMade: Record<string, unknown>
  completedBy: string | null
  completedAt: Date | null

  // Métriques
  timeToDecisionMs: number | null
  expiresAt: Date | null

  createdAt: Date
  updatedAt: Date
}

/**
 * Action suggérée pour la revue
 */
export interface SuggestedAction {
  action: string
  description: string
  recommended: boolean
}

/**
 * Statistiques de la queue de revue
 */
export interface ReviewQueueStats {
  pendingCount: number
  assignedCount: number
  completedToday: number
  avgDecisionTimeMs: number
  byType: Record<ReviewType, number>
  byPriority: Record<ReviewPriority, number>
  byDecision: Record<ReviewDecision, number>
}

/**
 * Statistiques du pipeline intelligent
 */
export interface IntelligentPipelineStats {
  totalProcessed: number
  autoIndexed: number
  autoRejected: number
  pendingReview: number
  avgQualityScore: number
  byDomain: Record<LegalDomain, number>
  byCategory: Record<LegalContentCategory, number>
  contradictionsCount: number
  contradictionsCritical: number
}

/**
 * Résultat du traitement d'une page par le pipeline
 */
export interface PipelineResult {
  pageId: string
  qualityScore: number
  classification: LegalClassification | null
  contradictions: ContentContradiction[]
  decision: 'indexed' | 'review_required' | 'rejected'
  reviewId?: string
  processingTimeMs: number
  errors: string[]
}

/**
 * Configuration des seuils du pipeline
 */
export interface PipelineThresholds {
  autoRejectBelow: number      // Score < X = rejet auto (défaut: 60)
  reviewRequired: [number, number]  // Score entre X et Y = revue humaine (défaut: 60-80)
  autoIndexAbove: number       // Score > X = indexation auto (défaut: 80)
  classificationConfidenceMin: number  // Confiance min pour auto-validation (défaut: 0.7)
}

/**
 * Options pour la recherche de documents similaires
 */
export interface SimilarDocumentOptions {
  minSimilarity: number
  maxResults: number
  sameDomainOnly: boolean
  includeIndexed: boolean
}

/**
 * Document similaire trouvé
 */
export interface SimilarDocument {
  pageId: string
  url: string
  title: string | null
  similarity: number
  potentialConflict: boolean
  conflictReason?: string
}

/**
 * Extension de WebPage avec les champs du pipeline intelligent
 */
export interface WebPageExtended extends WebPage {
  qualityScore: number | null
  relevanceScore: number | null
  legalDomain: LegalDomain | null
  requiresHumanReview: boolean
  processingStatus: ProcessingStatus
}

// =============================================================================
// TYPES POUR LE VERSIONING DES PAGES
// =============================================================================

export interface WebPageVersion {
  id: string
  webPageId: string
  version: number
  title: string | null
  contentHash: string | null
  wordCount: number | null
  changeType: 'initial_crawl' | 'content_change' | 'metadata_change' | 'restore'
  diffSummary: string | null
  createdAt: Date
}

// =============================================================================
// TYPES POUR LES MÉTADONNÉES STRUCTURÉES
// =============================================================================

export interface WebPageStructuredMetadata {
  id: string
  webPageId: string
  documentType: string | null
  documentDate: Date | null
  documentNumber: string | null
  titleOfficial: string | null
  language: string | null
  tribunal: string | null
  chambre: string | null
  decisionNumber: string | null
  decisionDate: Date | null
  parties: Record<string, unknown> | null
  textType: string | null
  textNumber: string | null
  publicationDate: Date | null
  effectiveDate: Date | null
  jortReference: string | null
  author: string | null
  publicationName: string | null
  keywords: string[]
  abstract: string | null
  extractionConfidence: number
  llmProvider: string | null
  llmModel: string | null
  extractedAt: Date
}

// =============================================================================
// TYPES POUR LE SCHEDULER
// =============================================================================

export interface WebSchedulerConfig {
  isEnabled: boolean
  maxConcurrentCrawls: number
  maxCrawlsPerHour: number
  defaultFrequency: string
  scheduleStartHour: number
  scheduleEndHour: number
  lastRunAt: Date | null
  lastRunResult: Record<string, unknown> | null
  totalRuns: number
  totalErrors: number
}

// =============================================================================
// TYPES POUR LA STRUCTURE DU SITE (utilisés pour la classification)
// =============================================================================

/**
 * Structure extraite du site web
 */
export interface SiteStructure {
  breadcrumbs: Breadcrumb[]
  urlPath: UrlPathAnalysis
  navigation: NavigationItem[]
  headings: HeadingHierarchy
  sectionContext: SectionContext | null
}

export interface Breadcrumb {
  label: string
  url: string | null
  level: number
}

export interface UrlPathAnalysis {
  fullPath: string
  segments: UrlSegment[]
  queryParams: Record<string, string>
  detectedPatterns: UrlPattern[]
}

export interface UrlSegment {
  value: string
  position: number
  isNumeric: boolean
  isDate: boolean
  suggestedMeaning: string | null
}

export interface UrlPattern {
  pattern: string
  confidence: number
  suggestedCategory: string | null
  suggestedDomain: string | null
  suggestedDocumentType: string | null
}

export interface NavigationItem {
  label: string
  url: string | null
  isActive: boolean
  level: number
}

export interface HeadingHierarchy {
  h1: string | null
  h2: string[]
  h3: string[]
  structure: HeadingNode[]
}

export interface HeadingNode {
  level: number
  text: string
  children: HeadingNode[]
}

export interface SectionContext {
  parentSection: string | null
  currentSection: string | null
  siblingPages: string[]
}

// =============================================================================
// TYPES POUR LA PROTECTION ANTI-BANNISSEMENT
// =============================================================================

/**
 * Configuration de retry avec exponential backoff
 */
export interface RetryConfig {
  maxRetries: number
  initialDelayMs: number
  maxDelayMs: number
  retryableStatusCodes: number[]
  retryableErrors: string[]
}

/**
 * État de bannissement d'une source
 */
export interface SourceBanStatus {
  sourceId: string
  isBanned: boolean
  bannedAt?: Date
  retryAfter?: Date
  reason?: string
  detectionConfidence?: 'low' | 'medium' | 'high'
}

/**
 * Statistiques de santé du crawler par source
 */
export interface CrawlerHealthStats {
  sourceId: string
  sourceName: string

  // Métriques de succès
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  successRate: number

  // Erreurs HTTP
  errors429: number // Too Many Requests
  errors403: number // Forbidden
  errors503: number // Service Unavailable
  errors5xx: number // Server errors

  // Bannissement
  banDetections: number
  currentlyBanned: boolean
  lastBanAt?: Date

  // Performance
  avgResponseTimeMs: number
  medianResponseTimeMs: number
  p95ResponseTimeMs: number

  // Quotas
  pagesThisHour: number
  pagesThisDay: number
  quotaHourlyLimit?: number
  quotaDailyLimit?: number
  quotaExceeded: boolean

  // Période
  periodStart: Date
  periodEnd: Date
  lastCrawlAt?: Date
}
