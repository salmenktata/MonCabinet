/**
 * Types et utilitaires pour les options de purge RAG
 *
 * Ce fichier est séparé pour pouvoir être importé côté client
 * sans dépendances serveur (pg, minio, etc.)
 */

export interface PurgeOptions {
  // Knowledge Base
  purgeDocuments?: boolean      // knowledge_base
  purgeChunks?: boolean         // knowledge_base_chunks
  purgeVersions?: boolean       // knowledge_base_versions
  purgeCategories?: boolean     // knowledge_categories
  purgeKBFiles?: boolean        // MinIO bucket knowledge-base

  // Web Sources
  purgeSources?: boolean        // web_sources
  purgePages?: boolean          // web_pages
  purgeWebFiles?: boolean       // web_files
  purgeCrawlLogs?: boolean      // web_crawl_logs
  purgeCrawlJobs?: boolean      // web_crawl_jobs
  purgeWebMinIO?: boolean       // MinIO bucket web-files

  // Legacy option (backward compatibility)
  keepCategories?: boolean      // Inverse de purgeCategories
}

/**
 * Normalise les options de purge en forçant les dépendances FK
 */
export function normalizePurgeOptions(options: PurgeOptions): PurgeOptions {
  const normalized = { ...options }

  // Si on purge les documents, on doit aussi purger chunks et versions (FK)
  if (normalized.purgeDocuments) {
    normalized.purgeChunks = true
    normalized.purgeVersions = true
  }

  // Si on purge les sources, on doit purger tout le reste web (FK)
  if (normalized.purgeSources) {
    normalized.purgePages = true
    normalized.purgeWebFiles = true
    normalized.purgeCrawlLogs = true
    normalized.purgeCrawlJobs = true
  }

  // Si on purge les pages, on doit purger les fichiers web (FK)
  if (normalized.purgePages) {
    normalized.purgeWebFiles = true
  }

  return normalized
}

/**
 * Valide les dépendances entre options et retourne les warnings
 */
export function validatePurgeOptions(options: PurgeOptions): {
  isValid: boolean
  warnings: string[]
  forcedOptions: PurgeOptions
} {
  const warnings: string[] = []
  const forcedOptions: PurgeOptions = {}

  // Si on purge les documents, on doit aussi purger chunks et versions
  if (options.purgeDocuments) {
    if (!options.purgeChunks) {
      warnings.push('Les chunks seront également supprimés (dépendance FK)')
      forcedOptions.purgeChunks = true
    }
    if (!options.purgeVersions) {
      warnings.push('Les versions seront également supprimées (dépendance FK)')
      forcedOptions.purgeVersions = true
    }
  }

  // Si on purge les sources, on doit purger tout le reste web
  if (options.purgeSources) {
    if (!options.purgePages) {
      warnings.push('Les pages seront également supprimées (dépendance FK)')
      forcedOptions.purgePages = true
    }
    if (!options.purgeWebFiles) {
      warnings.push('Les fichiers web seront également supprimés (dépendance FK)')
      forcedOptions.purgeWebFiles = true
    }
    if (!options.purgeCrawlLogs) {
      warnings.push('Les logs de crawl seront également supprimés (dépendance FK)')
      forcedOptions.purgeCrawlLogs = true
    }
    if (!options.purgeCrawlJobs) {
      warnings.push('Les jobs de crawl seront également supprimés (dépendance FK)')
      forcedOptions.purgeCrawlJobs = true
    }
  }

  // Si on purge les pages, on doit purger les fichiers web
  if (options.purgePages && !options.purgeWebFiles) {
    warnings.push('Les fichiers web seront également supprimés (dépendance FK)')
    forcedOptions.purgeWebFiles = true
  }

  return {
    isValid: true,
    warnings,
    forcedOptions,
  }
}

/**
 * Options par défaut pour une purge complète
 */
export function getDefaultPurgeOptions(): PurgeOptions {
  return {
    purgeDocuments: true,
    purgeChunks: true,
    purgeVersions: true,
    purgeCategories: false, // Par défaut on garde les catégories
    purgeKBFiles: true,
    purgeSources: true,
    purgePages: true,
    purgeWebFiles: true,
    purgeCrawlLogs: true,
    purgeCrawlJobs: true,
    purgeWebMinIO: true,
  }
}
