/**
 * Service de queue d'indexation asynchrone
 *
 * Gère l'indexation des documents de la base de connaissances
 * via une queue PostgreSQL pour éviter les timeouts.
 */

import { db } from '@/lib/db/postgres'

// =============================================================================
// TYPES
// =============================================================================

export type JobType =
  | 'document'
  | 'knowledge_base'
  | 'reindex'
  | 'web_page_index'
  // Nouveaux types pour le pipeline intelligent
  | 'content_analysis'       // Analyse qualité du contenu
  | 'legal_classification'   // Classification juridique
  | 'contradiction_check'    // Détection contradictions
  | 'full_pipeline'          // Pipeline complet (analyse + classification + contradictions)
  // Types KB quality & duplicates
  | 'kb_quality_analysis'    // Analyse qualité document KB
  | 'kb_duplicate_check'     // Détection doublons KB

export interface IndexingJob {
  id: string
  jobType: JobType
  targetId: string
  priority: number
  attempts: number
  metadata: Record<string, unknown>
}

export interface QueueStats {
  pendingCount: number
  processingCount: number
  completedToday: number
  failedToday: number
  avgProcessingTimeMs: number | null
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const INDEXING_BATCH_SIZE = parseInt(process.env.INDEXING_BATCH_SIZE || '5', 10)
const INDEXING_MAX_ATTEMPTS = parseInt(process.env.INDEXING_MAX_ATTEMPTS || '3', 10)

// =============================================================================
// FONCTIONS DE QUEUE
// =============================================================================

/**
 * Ajoute un document à la queue d'indexation
 * Évite les doublons automatiquement.
 *
 * @param jobType - Type de job (document, knowledge_base, reindex)
 * @param targetId - ID du document/KB à indexer
 * @param priority - Priorité (1-10, 10 = plus haute)
 * @param metadata - Métadonnées optionnelles
 * @returns ID du job créé ou existant
 */
export async function addToQueue(
  jobType: JobType,
  targetId: string,
  priority: number = 5,
  metadata: Record<string, unknown> = {}
): Promise<string> {
  const result = await db.query(
    `SELECT add_indexing_job($1, $2, $3, $4) as job_id`,
    [jobType, targetId, priority, JSON.stringify(metadata)]
  )

  const jobId = result.rows[0].job_id
  console.log(`[IndexingQueue] Job ajouté: ${jobType} ${targetId} (id: ${jobId})`)

  return jobId
}

/**
 * Récupère et verrouille le prochain job à traiter
 * Utilise SKIP LOCKED pour éviter les conflits en parallèle.
 *
 * @returns Job à traiter ou null si queue vide
 */
export async function claimNextJob(): Promise<IndexingJob | null> {
  const result = await db.query(`SELECT * FROM claim_next_indexing_job()`)

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    id: row.id,
    jobType: row.job_type as JobType,
    targetId: row.target_id,
    priority: row.priority,
    attempts: row.attempts,
    metadata: row.metadata || {},
  }
}

/**
 * Marque un job comme terminé (succès ou échec)
 *
 * @param jobId - ID du job
 * @param success - true si succès, false si échec
 * @param errorMessage - Message d'erreur si échec
 */
export async function completeJob(
  jobId: string,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  await db.query(`SELECT complete_indexing_job($1, $2, $3)`, [
    jobId,
    success,
    errorMessage || null,
  ])

  console.log(
    `[IndexingQueue] Job ${success ? 'terminé' : 'échoué'}: ${jobId}${
      errorMessage ? ` - ${errorMessage}` : ''
    }`
  )
}

/**
 * Traite le prochain job de la queue
 * À appeler depuis le cron worker.
 *
 * @returns true si un job a été traité, false si queue vide
 */
export async function processNextJob(): Promise<boolean> {
  const job = await claimNextJob()

  if (!job) {
    return false
  }

  console.log(
    `[IndexingQueue] Traitement job: ${job.jobType} ${job.targetId} (tentative ${job.attempts})`
  )

  try {
    // Importer dynamiquement pour éviter les dépendances circulaires
    if (job.jobType === 'knowledge_base') {
      const { indexKnowledgeDocument } = await import('./knowledge-base-service')
      const result = await indexKnowledgeDocument(job.targetId)

      if (result.success) {
        await completeJob(job.id, true)
        console.log(
          `[IndexingQueue] KB indexé: ${job.targetId} (${result.chunksCreated} chunks)`
        )
      } else {
        await completeJob(job.id, false, result.error)
      }
    } else if (job.jobType === 'document') {
      // TODO: Implémenter indexation documents utilisateur si nécessaire
      await completeJob(job.id, true)
    } else if (job.jobType === 'reindex') {
      // Réindexer un document existant
      const { indexKnowledgeDocument } = await import('./knowledge-base-service')
      const result = await indexKnowledgeDocument(job.targetId)
      await completeJob(job.id, result.success, result.error)
    } else if (job.jobType === 'web_page_index') {
      // Indexer une page web crawlée
      const { indexWebPage } = await import('../web-scraper/web-indexer-service')
      const result = await indexWebPage(job.targetId)

      if (result.success) {
        await completeJob(job.id, true)
        console.log(
          `[IndexingQueue] Page web indexée: ${job.targetId} (${result.chunksCreated} chunks)`
        )
      } else {
        await completeJob(job.id, false, result.error)
      }
    } else if (job.jobType === 'content_analysis') {
      // Analyse qualité du contenu
      const { analyzeContentQuality } = await import('../web-scraper/content-analyzer-service')
      const result = await analyzeContentQuality(job.targetId)
      await completeJob(job.id, true)
      console.log(
        `[IndexingQueue] Analyse qualité terminée: ${job.targetId} (score: ${result.overallScore})`
      )
    } else if (job.jobType === 'legal_classification') {
      // Classification juridique
      const { classifyLegalContent } = await import('../web-scraper/legal-classifier-service')
      const result = await classifyLegalContent(job.targetId)
      await completeJob(job.id, true)
      console.log(
        `[IndexingQueue] Classification terminée: ${job.targetId} ` +
        `(${result.primaryCategory}/${result.domain}, confiance: ${result.confidenceScore.toFixed(2)})`
      )
    } else if (job.jobType === 'contradiction_check') {
      // Détection des contradictions
      const { detectContradictions } = await import('../web-scraper/contradiction-detector-service')
      const result = await detectContradictions(job.targetId)
      await completeJob(job.id, true)
      console.log(
        `[IndexingQueue] Vérification contradictions terminée: ${job.targetId} ` +
        `(${result.contradictions.length} trouvées, sévérité: ${result.severity})`
      )
    } else if (job.jobType === 'full_pipeline') {
      // Pipeline complet: analyse + classification + contradictions + décision
      const { processPage } = await import('../web-scraper/intelligent-pipeline-service')
      const result = await processPage(job.targetId)

      await completeJob(job.id, result.errors.length === 0, result.errors.join('; ') || undefined)
      console.log(
        `[IndexingQueue] Pipeline complet terminé: ${job.targetId} ` +
        `(score: ${result.qualityScore}, décision: ${result.decision}, ` +
        `${result.processingTimeMs}ms)`
      )
    } else if (job.jobType === 'kb_quality_analysis') {
      // Analyse qualité document KB
      const { analyzeKBDocumentQuality } = await import('./kb-quality-analyzer-service')
      const result = await analyzeKBDocumentQuality(job.targetId)
      await completeJob(job.id, true)
      console.log(
        `[IndexingQueue] Qualité KB analysée: ${job.targetId} (score: ${result.qualityScore})`
      )
    } else if (job.jobType === 'kb_duplicate_check') {
      // Détection doublons KB
      const { detectDuplicatesAndContradictions } = await import('./kb-duplicate-detector-service')
      const result = await detectDuplicatesAndContradictions(job.targetId)
      await completeJob(job.id, true)
      console.log(
        `[IndexingQueue] Doublons KB vérifiés: ${job.targetId} ` +
        `(${result.duplicates.length} doublons, ${result.contradictions.length} contradictions)`
      )
    }

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'
    await completeJob(job.id, false, errorMessage)
    console.error(`[IndexingQueue] Erreur traitement job ${job.id}:`, error)
    return true // On a quand même "traité" le job (en échec)
  }
}

/**
 * Traite un batch de jobs
 *
 * @param maxJobs - Nombre max de jobs à traiter
 * @returns Nombre de jobs traités
 */
export async function processBatch(maxJobs: number = INDEXING_BATCH_SIZE): Promise<number> {
  let processed = 0

  for (let i = 0; i < maxJobs; i++) {
    const didProcess = await processNextJob()
    if (!didProcess) {
      break // Queue vide
    }
    processed++
  }

  return processed
}

/**
 * Récupère les statistiques de la queue
 */
export async function getQueueStats(): Promise<QueueStats> {
  const result = await db.query(`SELECT * FROM get_indexing_queue_stats()`)

  if (result.rows.length === 0) {
    return {
      pendingCount: 0,
      processingCount: 0,
      completedToday: 0,
      failedToday: 0,
      avgProcessingTimeMs: null,
    }
  }

  const row = result.rows[0]
  return {
    pendingCount: parseInt(row.pending_count) || 0,
    processingCount: parseInt(row.processing_count) || 0,
    completedToday: parseInt(row.completed_today) || 0,
    failedToday: parseInt(row.failed_today) || 0,
    avgProcessingTimeMs: row.avg_processing_time_ms
      ? parseFloat(row.avg_processing_time_ms)
      : null,
  }
}

/**
 * Nettoie les vieux jobs terminés
 *
 * @returns Nombre de jobs supprimés
 */
export async function cleanupOldJobs(): Promise<number> {
  const result = await db.query(`SELECT cleanup_old_indexing_jobs() as deleted`)
  return parseInt(result.rows[0].deleted) || 0
}

/**
 * Récupère les jobs en attente pour un target
 */
export async function getPendingJobsForTarget(targetId: string): Promise<IndexingJob[]> {
  const result = await db.query(
    `SELECT id, job_type, target_id, priority, attempts, metadata
     FROM indexing_jobs
     WHERE target_id = $1 AND status IN ('pending', 'processing')
     ORDER BY created_at DESC`,
    [targetId]
  )

  return result.rows.map((row) => ({
    id: row.id,
    jobType: row.job_type as JobType,
    targetId: row.target_id,
    priority: row.priority,
    attempts: row.attempts,
    metadata: row.metadata || {},
  }))
}
