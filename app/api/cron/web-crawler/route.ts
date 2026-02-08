/**
 * API Route: Cron - Web Crawler Worker
 *
 * GET /api/cron/web-crawler
 * - Exécute les jobs de crawl en attente
 * - Planifie les crawls pour les sources dont next_crawl_at est dépassé
 *
 * Protégé par CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

import { db } from '@/lib/db/postgres'
import {
  getSourcesToCrawl,
  createCrawlJob,
  crawlSource,
} from '@/lib/web-scraper'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'
import { processBatch as processPipelineBatch, getPendingPages } from '@/lib/web-scraper/intelligent-pipeline-service'

// Configuration du pipeline intelligent
const ENABLE_INTELLIGENT_PIPELINE = process.env.ENABLE_INTELLIGENT_PIPELINE !== 'false'
const PIPELINE_BATCH_SIZE = parseInt(process.env.PIPELINE_BATCH_SIZE || '10', 10)

// =============================================================================
// VÉRIFICATION CRON SECRET
// =============================================================================

function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    console.warn('[WebCrawler Cron] CRON_SECRET non configuré')
    return false
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return false
  }

  return true
}

// =============================================================================
// GET: Exécuter le worker de crawl
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  // Vérifier l'authentification
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  console.log('[WebCrawler Cron] Démarrage...')

  try {
    // 1. Traiter les jobs en attente
    const pendingJobsResult = await processPendingJobs()

    // 2. Créer des jobs pour les sources qui doivent être crawlées
    const scheduledResult = await scheduleSourceCrawls()

    // 3. Traiter les pages en attente via le pipeline intelligent
    let pipelineResult = { processed: 0, indexed: 0, reviewRequired: 0, rejected: 0 }
    if (ENABLE_INTELLIGENT_PIPELINE) {
      pipelineResult = await processIntelligentPipeline()
    }

    // 4. Mettre à jour les scores de fraîcheur (une fois par jour)
    const freshnessUpdated = await updateFreshnessIfNeeded()

    const duration = Date.now() - startTime

    console.log(`[WebCrawler Cron] Terminé en ${duration}ms`)

    return NextResponse.json({
      success: true,
      duration,
      pendingJobs: pendingJobsResult,
      scheduled: scheduledResult,
      pipeline: pipelineResult,
      freshnessUpdated,
    })
  } catch (error) {
    console.error('[WebCrawler Cron] Erreur:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur worker',
      },
      { status: 500 }
    )
  }
}

// =============================================================================
// TRAITEMENT DES JOBS EN ATTENTE
// =============================================================================

async function processPendingJobs(): Promise<{
  processed: number
  succeeded: number
  failed: number
}> {
  let processed = 0
  let succeeded = 0
  let failed = 0

  // Limite le nombre de jobs à traiter par exécution
  const maxJobs = 3

  for (let i = 0; i < maxJobs; i++) {
    // Réclamer le prochain job
    const jobResult = await db.query('SELECT * FROM claim_next_crawl_job($1)', [
      `cron-${Date.now()}`,
    ])

    if (jobResult.rows.length === 0) {
      break // Plus de jobs en attente
    }

    const job = jobResult.rows[0]
    processed++

    console.log(`[WebCrawler Cron] Traitement job ${job.job_id} (${job.job_type}) pour ${job.source_name}`)

    try {
      // Construire l'objet source avec les valeurs de la DB
      const source = {
        id: job.web_source_id,
        name: job.source_name,
        baseUrl: job.base_url,
        category: job.category,
        requiresJavascript: job.requires_javascript,
        cssSelectors: job.css_selectors || {},
        maxDepth: job.max_depth,
        maxPages: job.max_pages,
        rateLimitMs: job.rate_limit_ms,
        timeoutMs: job.timeout_ms,
        respectRobotsTxt: job.respect_robots_txt,
        userAgent: job.user_agent,
        customHeaders: job.custom_headers || {},
        seedUrls: job.seed_urls || [],
        formCrawlConfig: job.form_crawl_config || null,
        ignoreSSLErrors: job.ignore_ssl_errors || false,
        urlPatterns: job.url_patterns || [],
        excludedPatterns: job.excluded_patterns || [],
        followLinks: job.follow_links ?? true,
        downloadFiles: job.download_files ?? true,
      }

      // Exécuter le crawl
      const crawlResult = await crawlSource(source as any, {
        incrementalMode: job.job_type === 'incremental',
      })

      // Compléter le job
      await db.query(
        `SELECT complete_crawl_job($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          job.job_id,
          crawlResult.success,
          crawlResult.pagesProcessed,
          crawlResult.pagesNew,
          crawlResult.pagesChanged,
          crawlResult.pagesFailed,
          crawlResult.filesDownloaded,
          crawlResult.success ? null : 'Crawl completed with errors',
          JSON.stringify(crawlResult.errors.slice(0, 10)),
        ]
      )

      // Indexer les nouvelles pages
      if (crawlResult.pagesNew + crawlResult.pagesChanged > 0) {
        const params = job.params || {}
        if (params.indexAfterCrawl !== false) {
          await indexSourcePages(job.web_source_id, { limit: 50 })
        }
      }

      succeeded++
      console.log(`[WebCrawler Cron] Job ${job.job_id} terminé: ${crawlResult.pagesProcessed} pages`)

    } catch (error) {
      failed++
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'

      // Marquer le job comme échoué
      await db.query(
        `SELECT complete_crawl_job($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [job.job_id, false, 0, 0, 0, 0, 0, errorMessage, '[]']
      )

      console.error(`[WebCrawler Cron] Erreur job ${job.job_id}:`, error)
    }
  }

  return { processed, succeeded, failed }
}

// =============================================================================
// PLANIFICATION DES CRAWLS
// =============================================================================

async function scheduleSourceCrawls(): Promise<{
  sourcesChecked: number
  jobsCreated: number
  schedulerEnabled: boolean
}> {
  // Vérifier la config du scheduler
  let schedulerEnabled = true
  let maxConcurrentCrawls = 3
  let scheduleStartHour = 0
  let scheduleEndHour = 24

  try {
    const { getSchedulerConfig, recordSchedulerRun } = await import('@/lib/web-scraper/scheduler-service')
    const config = await getSchedulerConfig()

    schedulerEnabled = config.isEnabled
    maxConcurrentCrawls = config.maxConcurrentCrawls
    scheduleStartHour = config.scheduleStartHour
    scheduleEndHour = config.scheduleEndHour

    if (!schedulerEnabled) {
      console.log('[WebCrawler Cron] Scheduler désactivé')
      return { sourcesChecked: 0, jobsCreated: 0, schedulerEnabled: false }
    }

    // Vérifier la fenêtre horaire
    const currentHour = new Date().getHours()
    if (currentHour < scheduleStartHour || currentHour >= scheduleEndHour) {
      console.log(`[WebCrawler Cron] Hors fenêtre horaire (${scheduleStartHour}h-${scheduleEndHour}h)`)
      return { sourcesChecked: 0, jobsCreated: 0, schedulerEnabled: true }
    }
  } catch {
    // Scheduler config table may not exist yet, continue with defaults
  }

  // Récupérer les sources qui doivent être crawlées (filtrer auto_crawl_enabled)
  const sources = await getSourcesToCrawl(maxConcurrentCrawls)

  let jobsCreated = 0

  for (const source of sources) {
    try {
      await createCrawlJob(source.id, 'incremental', source.priority)
      jobsCreated++
      console.log(`[WebCrawler Cron] Job planifié pour ${source.name}`)
    } catch (error) {
      // Ignorer si un job existe déjà
      if (error instanceof Error && error.message.includes('déjà en cours')) {
        continue
      }
      console.error(`[WebCrawler Cron] Erreur planification ${source.name}:`, error)
    }
  }

  // Logger le résultat dans la config scheduler
  try {
    const { recordSchedulerRun } = await import('@/lib/web-scraper/scheduler-service')
    await recordSchedulerRun({
      sourcesProcessed: sources.length,
      crawlsStarted: jobsCreated,
      errors: 0,
    })
  } catch {
    // Ignorer si la table n'existe pas encore
  }

  return {
    sourcesChecked: sources.length,
    jobsCreated,
    schedulerEnabled,
  }
}

// =============================================================================
// MISE À JOUR FRAÎCHEUR
// =============================================================================

async function updateFreshnessIfNeeded(): Promise<number> {
  // Vérifier si la mise à jour a été faite aujourd'hui
  const lastUpdateResult = await db.query(
    `SELECT MAX(completed_at) as last_update
     FROM web_crawl_logs
     WHERE status = 'completed'`
  )

  const lastUpdate = lastUpdateResult.rows[0]?.last_update
  const today = new Date().toISOString().split('T')[0]

  if (lastUpdate) {
    const lastUpdateDate = new Date(lastUpdate).toISOString().split('T')[0]
    if (lastUpdateDate === today) {
      // Déjà fait aujourd'hui, mettre à jour la fraîcheur
      const result = await db.query('SELECT update_pages_freshness() as updated')
      return result.rows[0]?.updated || 0
    }
  }

  return 0
}

// =============================================================================
// PIPELINE INTELLIGENT
// =============================================================================

async function processIntelligentPipeline(): Promise<{
  processed: number
  indexed: number
  reviewRequired: number
  rejected: number
}> {
  try {
    // Récupérer les pages en attente de traitement
    const pendingPageIds = await getPendingPages({ limit: PIPELINE_BATCH_SIZE })

    if (pendingPageIds.length === 0) {
      return { processed: 0, indexed: 0, reviewRequired: 0, rejected: 0 }
    }

    console.log(`[WebCrawler Cron] Pipeline: traitement de ${pendingPageIds.length} pages`)

    // Traiter le batch
    const { summary } = await processPipelineBatch(pendingPageIds, {
      skipContradictionCheck: false, // Activer la détection de contradictions
      concurrency: 1, // Séquentiel pour éviter la surcharge Ollama sur VPS
    })

    console.log(`[WebCrawler Cron] Pipeline terminé: ${summary.indexed} indexées, ${summary.reviewRequired} en revue, ${summary.rejected} rejetées`)

    return {
      processed: summary.total,
      indexed: summary.indexed,
      reviewRequired: summary.reviewRequired,
      rejected: summary.rejected,
    }
  } catch (error) {
    console.error('[WebCrawler Cron] Erreur pipeline intelligent:', error)
    return { processed: 0, indexed: 0, reviewRequired: 0, rejected: 0 }
  }
}
