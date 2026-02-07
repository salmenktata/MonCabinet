/**
 * Types pour le système d'ingestion web
 */

export type WebSourceCategory =
  | 'legislation'
  | 'jurisprudence'
  | 'doctrine'
  | 'jort'
  | 'modeles'
  | 'procedures'
  | 'formulaires'
  | 'autre'

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

  // Configuration Technique
  requiresJavascript: boolean
  userAgent: string
  rateLimitMs: number
  timeoutMs: number
  respectRobotsTxt: boolean
  customHeaders: Record<string, string>

  // Sitemap & RSS
  sitemapUrl: string | null
  rssFeedUrl: string | null
  useSitemap: boolean

  // État
  isActive: boolean
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
  /** Source de détection: 'link' | 'iframe' | 'global' */
  source?: 'link' | 'iframe' | 'global'
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
}

export interface UpdateWebSourceInput {
  name?: string
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
  isActive?: boolean
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
 */
export type LegalDomain =
  | 'civil'
  | 'commercial'
  | 'penal'
  | 'famille'
  | 'fiscal'
  | 'social'
  | 'administratif'
  | 'immobilier'
  | 'bancaire'
  | 'propriete_intellectuelle'
  | 'international'
  | 'autre'

/**
 * Catégories de contenu juridique (étendu)
 */
export type LegalContentCategory =
  | 'legislation'
  | 'jurisprudence'
  | 'doctrine'
  | 'jort'
  | 'modeles'
  | 'procedures'
  | 'formulaires'
  | 'actualites'
  | 'autre'

/**
 * Nature des documents juridiques
 */
export type DocumentNature =
  | 'loi'
  | 'decret'
  | 'arrete'
  | 'circulaire'
  | 'ordonnance'
  | 'arret'
  | 'jugement'
  | 'ordonnance_jud'
  | 'avis'
  | 'article_doctrine'
  | 'these'
  | 'commentaire'
  | 'note'
  | 'modele_contrat'
  | 'modele_acte'
  | 'formulaire'
  | 'guide_pratique'
  | 'faq'
  | 'actualite'
  | 'autre'

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
