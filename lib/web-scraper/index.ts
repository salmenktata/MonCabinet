/**
 * Module Web Scraper - Point d'entrée
 * Système d'ingestion web pour le RAG juridique Qadhya
 */

// Types
export * from './types'

// Services
export {
  // Robots.txt
  getRobotsRules,
  isUrlAllowed,
  getSitemapsFromRobots,
  clearRobotsCache,
} from './robots-parser'

export {
  // Extraction de contenu
  extractContent,
  hashContent,
  hashUrl,
  countWords,
  normalizeText,
  detectTextLanguage,
} from './content-extractor'

export {
  // Scraping
  fetchHtml,
  fetchHtmlDynamic,
  scrapeUrl,
  checkForChanges,
  downloadFile,
  generatePageIds,
} from './scraper-service'

export {
  // Crawling
  crawlSource,
  crawlSinglePage,
} from './crawler-service'

export {
  // Indexation RAG
  indexWebPage,
  indexSourcePages,
  queueSourcePagesForIndexing,
  getSourceIndexingStats,
  unindexWebPage,
} from './web-indexer-service'

export {
  // Gestion des sources
  listWebSources,
  getWebSource,
  getWebSourceByUrl,
  createWebSource,
  updateWebSource,
  deleteWebSource,
  // Pages
  listWebPages,
  getWebPage,
  deleteWebPage,
  // Jobs
  createCrawlJob,
  listCrawlJobs,
  listCrawlLogs,
  // Stats
  getWebSourcesStats,
  getSourcesToCrawl,
} from './source-service'

// =============================================================================
// SYSTÈME INTELLIGENT DE TRAITEMENT DU CONTENU
// =============================================================================

export {
  // Analyse qualité
  analyzeContentQuality,
  getQualityAssessment,
  getAssessmentsRequiringReview,
  QUALITY_THRESHOLDS,
} from './content-analyzer-service'

export {
  // Classification juridique
  classifyLegalContent,
  getClassification,
  validateClassification,
  getClassificationsRequiringValidation,
  getClassificationStats,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
} from './legal-classifier-service'

export {
  // Détection contradictions
  detectContradictions,
  findSimilarDocuments,
  getContradictions,
  resolveContradiction,
  getContradictionStats,
} from './contradiction-detector-service'

export {
  // Queue revue humaine
  createReviewRequest,
  getReviewQueue,
  getReviewItem,
  claimNextReview,
  completeReview,
  skipReview,
  reassignReview,
  getReviewStats,
  getPendingCountForUser,
  getReviewHistory,
} from './human-review-service'

export {
  // Pipeline intelligent
  processPage,
  processBatch,
  getPendingPages,
  getPipelineStats,
} from './intelligent-pipeline-service'

export {
  // Utilitaires TYPO3 CSRF (cassation.tn)
  extractCsrfTokens,
  buildSearchPostBody,
  searchCassationJurisprudence,
  CASSATION_THEMES,
} from './typo3-csrf-utils'
export type {
  Typo3CsrfTokens,
  CassationSearchParams,
} from './typo3-csrf-utils'
