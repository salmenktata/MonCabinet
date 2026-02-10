/**
 * Service de purge RAG complet
 *
 * Permet de supprimer toutes les données RAG (base de connaissances + sources web)
 * pour repartir sur un apprentissage frais.
 *
 * ATTENTION: Cette opération est IRRÉVERSIBLE !
 */

import { query, db } from '@/lib/db/postgres'
import { listFiles, deleteFiles } from '@/lib/storage/minio'
import type { PoolClient } from 'pg'

// Réexporter les types et fonctions partagées depuis purge-options.ts
export type { PurgeOptions } from './purge-options'
export { normalizePurgeOptions, validatePurgeOptions, getDefaultPurgeOptions } from './purge-options'
import type { PurgeOptions } from './purge-options'
import { normalizePurgeOptions } from './purge-options'

export interface PurgeStats {
  knowledgeBase: {
    documents: number
    chunks: number
    versions: number
  }
  webSources: {
    sources: number
    pages: number
    files: number
    crawlJobs: number
    crawlLogs: number
  }
  contentReview: {
    reviewQueue: number
    qualityAssessments: number
    classifications: number
    contradictions: number
  }
  storage: {
    knowledgeBaseFiles: number
    webFiles: number
  }
}

export interface PurgeResult {
  success: boolean
  stats: PurgeStats
  deletedAt: Date
  errors?: string[]
  deletedCounts?: {
    documents?: number
    chunks?: number
    versions?: number
    categories?: number
    sources?: number
    pages?: number
    webFiles?: number
    crawlLogs?: number
    crawlJobs?: number
    reviewQueue?: number
    qualityAssessments?: number
    classifications?: number
    contradictions?: number
    kbMinIOFiles?: number
    webMinIOFiles?: number
  }
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Récupère les statistiques actuelles des données RAG
 */
export async function getRAGStats(): Promise<PurgeStats> {
  // Requêtes en parallèle pour les stats
  const [
    kbDocsResult,
    kbChunksResult,
    kbVersionsResult,
    webSourcesResult,
    webPagesResult,
    webFilesResult,
    crawlJobsResult,
    crawlLogsResult,
    reviewQueueResult,
    qualityAssessmentsResult,
    classificationsResult,
    contradictionsResult,
  ] = await Promise.all([
    query('SELECT COUNT(*) as count FROM knowledge_base'),
    query('SELECT COUNT(*) as count FROM knowledge_base_chunks'),
    query('SELECT COUNT(*) as count FROM knowledge_base_versions'),
    query('SELECT COUNT(*) as count FROM web_sources'),
    query('SELECT COUNT(*) as count FROM web_pages'),
    query('SELECT COUNT(*) as count FROM web_files'),
    query('SELECT COUNT(*) as count FROM web_crawl_jobs'),
    query('SELECT COUNT(*) as count FROM web_crawl_logs'),
    query('SELECT COUNT(*) as count FROM human_review_queue').catch(() => ({ rows: [{ count: '0' }] })),
    query('SELECT COUNT(*) as count FROM content_quality_assessments').catch(() => ({ rows: [{ count: '0' }] })),
    query('SELECT COUNT(*) as count FROM legal_classifications').catch(() => ({ rows: [{ count: '0' }] })),
    query('SELECT COUNT(*) as count FROM content_contradictions').catch(() => ({ rows: [{ count: '0' }] })),
  ])

  // Compter les fichiers MinIO
  let knowledgeBaseFilesCount = 0
  let webFilesCount = 0

  try {
    const kbFiles = await listFiles('', 'knowledge-base')
    knowledgeBaseFilesCount = kbFiles.length
  } catch {
    // Bucket peut ne pas exister
  }

  try {
    const wfFiles = await listFiles('', 'web-files')
    webFilesCount = wfFiles.length
  } catch {
    // Bucket peut ne pas exister
  }

  return {
    knowledgeBase: {
      documents: parseInt(kbDocsResult.rows[0]?.count || '0'),
      chunks: parseInt(kbChunksResult.rows[0]?.count || '0'),
      versions: parseInt(kbVersionsResult.rows[0]?.count || '0'),
    },
    webSources: {
      sources: parseInt(webSourcesResult.rows[0]?.count || '0'),
      pages: parseInt(webPagesResult.rows[0]?.count || '0'),
      files: parseInt(webFilesResult.rows[0]?.count || '0'),
      crawlJobs: parseInt(crawlJobsResult.rows[0]?.count || '0'),
      crawlLogs: parseInt(crawlLogsResult.rows[0]?.count || '0'),
    },
    contentReview: {
      reviewQueue: parseInt(reviewQueueResult.rows[0]?.count || '0'),
      qualityAssessments: parseInt(qualityAssessmentsResult.rows[0]?.count || '0'),
      classifications: parseInt(classificationsResult.rows[0]?.count || '0'),
      contradictions: parseInt(contradictionsResult.rows[0]?.count || '0'),
    },
    storage: {
      knowledgeBaseFiles: knowledgeBaseFilesCount,
      webFiles: webFilesCount,
    },
  }
}

// =============================================================================
// PURGE KNOWLEDGE BASE
// =============================================================================

/**
 * Supprime tous les chunks de la base de connaissances
 */
async function purgeKnowledgeBaseChunks(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM knowledge_base_chunks RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les versions de la base de connaissances
 */
async function purgeKnowledgeBaseVersions(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM knowledge_base_versions RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime tous les documents de la base de connaissances
 */
async function purgeKnowledgeBaseDocuments(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM knowledge_base RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les catégories (optionnel)
 */
async function purgeKnowledgeCategories(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM knowledge_categories RETURNING id')
  return result.rowCount || 0
}

// =============================================================================
// PURGE WEB SOURCES
// =============================================================================

/**
 * Supprime tous les fichiers web téléchargés
 */
async function purgeWebFiles(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM web_files RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les pages crawlées
 */
async function purgeWebPages(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM web_pages RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime tous les logs de crawl
 */
async function purgeCrawlLogs(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM web_crawl_logs RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime tous les jobs de crawl
 */
async function purgeCrawlJobs(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM web_crawl_jobs RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les sources web
 */
async function purgeWebSources(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM web_sources RETURNING id')
  return result.rowCount || 0
}

// =============================================================================
// PURGE CONTENT REVIEW
// =============================================================================

/**
 * Supprime toutes les entrées de la file de revue humaine
 */
async function purgeReviewQueue(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM human_review_queue RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les évaluations de qualité du contenu
 */
async function purgeQualityAssessments(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM content_quality_assessments RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les classifications juridiques
 */
async function purgeClassifications(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM legal_classifications RETURNING id')
  return result.rowCount || 0
}

/**
 * Supprime toutes les contradictions de contenu
 */
async function purgeContradictions(client: PoolClient): Promise<number> {
  const result = await client.query('DELETE FROM content_contradictions RETURNING id')
  return result.rowCount || 0
}

// =============================================================================
// PURGE MINIO
// =============================================================================

/**
 * Vide le bucket knowledge-base dans MinIO
 */
async function purgeMinIOKnowledgeBase(): Promise<number> {
  try {
    const files = await listFiles('', 'knowledge-base')
    if (files.length === 0) return 0

    const paths = files.map((f) => f.name).filter((name): name is string => !!name)
    if (paths.length > 0) {
      await deleteFiles(paths, 'knowledge-base')
    }
    return paths.length
  } catch (error) {
    console.error('Erreur purge MinIO knowledge-base:', error)
    return 0
  }
}

/**
 * Vide le bucket web-files dans MinIO
 */
async function purgeMinIOWebFiles(): Promise<number> {
  try {
    const files = await listFiles('', 'web-files')
    if (files.length === 0) return 0

    const paths = files.map((f) => f.name).filter((name): name is string => !!name)
    if (paths.length > 0) {
      await deleteFiles(paths, 'web-files')
    }
    return paths.length
  } catch (error) {
    console.error('Erreur purge MinIO web-files:', error)
    return 0
  }
}

// =============================================================================
// ORCHESTRATEUR PRINCIPAL
// =============================================================================

/**
 * Purge sélective des données RAG
 *
 * Ordre d'exécution (respect des FK):
 * 1. knowledge_base_chunks
 * 2. knowledge_base_versions
 * 3. knowledge_base
 * 4. knowledge_categories (optionnel)
 * 5. web_files
 * 6. web_pages
 * 7. web_crawl_logs
 * 8. web_crawl_jobs
 * 9. web_sources
 * 10. MinIO buckets (async)
 */
export async function purgeAllRAGData(options: PurgeOptions = {}): Promise<PurgeResult> {
  // Normaliser les options (gérer les dépendances FK)
  const normalizedOptions = normalizePurgeOptions(options)

  // Support de l'ancienne option keepCategories
  if (options.keepCategories !== undefined) {
    normalizedOptions.purgeCategories = !options.keepCategories
  }

  const errors: string[] = []
  const deletedCounts: PurgeResult['deletedCounts'] = {}

  // Collecter les stats avant purge
  const stats = await getRAGStats()

  // Vérifier si quelque chose doit être purgé
  const hasSomethingToPurge = Object.entries(normalizedOptions).some(
    ([key, value]) => key.startsWith('purge') && value === true
  )

  if (!hasSomethingToPurge) {
    return {
      success: true,
      stats,
      deletedAt: new Date(),
      deletedCounts,
    }
  }

  // Transaction pour la base de données
  // ORDRE CRITIQUE pour respecter les FK:
  // 1. knowledge_base_chunks (dépend de knowledge_base)
  // 2. knowledge_base_versions (dépend de knowledge_base)
  // 3. web_files (dépend de web_pages, web_sources, knowledge_base)
  // 4. web_crawl_logs (dépend de web_crawl_jobs, web_sources)
  // 5. web_pages (dépend de web_sources, knowledge_base)
  // 6. web_crawl_jobs (dépend de web_sources)
  // 7. knowledge_base (parent - après web_files et web_pages qui le référencent)
  // 8. web_sources (parent)
  // 9. knowledge_categories (indépendant)
  try {
    await db.transaction(async (client) => {
      console.log('🗑️ Début de la purge RAG sélective...')

      // 1. Purge chunks KB (dépend de knowledge_base)
      if (normalizedOptions.purgeChunks) {
        console.log('  → Suppression des chunks...')
        deletedCounts.chunks = await purgeKnowledgeBaseChunks(client)
      }

      // 2. Purge versions KB (dépend de knowledge_base)
      if (normalizedOptions.purgeVersions) {
        console.log('  → Suppression des versions...')
        deletedCounts.versions = await purgeKnowledgeBaseVersions(client)
      }

      // 3. Purge fichiers web (dépend de web_pages, web_sources, knowledge_base)
      if (normalizedOptions.purgeWebFiles) {
        console.log('  → Suppression des fichiers web...')
        deletedCounts.webFiles = await purgeWebFiles(client)
      }

      // 4. Purge content review (dépend de web_pages)
      if (normalizedOptions.purgeContentReview) {
        console.log('  → Suppression des données de revue de contenu...')
        deletedCounts.reviewQueue = await purgeReviewQueue(client)
        deletedCounts.qualityAssessments = await purgeQualityAssessments(client)
        deletedCounts.classifications = await purgeClassifications(client)
        deletedCounts.contradictions = await purgeContradictions(client)
      }

      // 5. Purge logs crawl (dépend de web_crawl_jobs, web_sources)
      if (normalizedOptions.purgeCrawlLogs) {
        console.log('  → Suppression des logs de crawl...')
        deletedCounts.crawlLogs = await purgeCrawlLogs(client)
      }

      // 6. Purge pages (dépend de web_sources, knowledge_base)
      if (normalizedOptions.purgePages) {
        console.log('  → Suppression des pages...')
        deletedCounts.pages = await purgeWebPages(client)
      }

      // 7. Purge jobs crawl (dépend de web_sources)
      if (normalizedOptions.purgeCrawlJobs) {
        console.log('  → Suppression des jobs de crawl...')
        deletedCounts.crawlJobs = await purgeCrawlJobs(client)
      }

      // 8. Purge documents KB (parent - après web_files et web_pages)
      if (normalizedOptions.purgeDocuments) {
        console.log('  → Suppression des documents...')
        deletedCounts.documents = await purgeKnowledgeBaseDocuments(client)
      }

      // 9. Purge sources web (parent)
      if (normalizedOptions.purgeSources) {
        console.log('  → Suppression des sources web...')
        deletedCounts.sources = await purgeWebSources(client)
      }

      // 10. Purge catégories (indépendant)
      if (normalizedOptions.purgeCategories) {
        console.log('  → Suppression des catégories...')
        deletedCounts.categories = await purgeKnowledgeCategories(client)
      }

      console.log('✅ Purge base de données terminée')
    })
  } catch (error) {
    console.error('❌ Erreur lors de la purge DB:', error)
    errors.push(`Erreur base de données: ${error instanceof Error ? error.message : 'Inconnue'}`)
    return {
      success: false,
      stats,
      deletedAt: new Date(),
      errors,
      deletedCounts,
    }
  }

  // 3. Purge MinIO (async, non-bloquant)
  console.log('🗑️ Purge des buckets MinIO...')
  try {
    if (normalizedOptions.purgeKBFiles) {
      deletedCounts.kbMinIOFiles = await purgeMinIOKnowledgeBase()
      console.log(`  → ${deletedCounts.kbMinIOFiles} fichiers knowledge-base supprimés`)
    }
    if (normalizedOptions.purgeWebMinIO) {
      deletedCounts.webMinIOFiles = await purgeMinIOWebFiles()
      console.log(`  → ${deletedCounts.webMinIOFiles} fichiers web supprimés`)
    }
  } catch (error) {
    console.error('⚠️ Erreur partielle MinIO:', error)
    errors.push(`Erreur MinIO (non critique): ${error instanceof Error ? error.message : 'Inconnue'}`)
  }

  console.log('✅ Purge RAG sélective terminée')

  return {
    success: true,
    stats,
    deletedAt: new Date(),
    errors: errors.length > 0 ? errors : undefined,
    deletedCounts,
  }
}

/**
 * Alias pour compatibilité avec l'ancien nom
 */
export const purgeRAGData = purgeAllRAGData
