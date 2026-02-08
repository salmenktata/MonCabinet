/**
 * Service de gestion du scheduler de crawl web
 * Configuration, statut et pilotage du planificateur
 */

import { db } from '@/lib/db/postgres'
import type { WebSchedulerConfig } from './types'

// =============================================================================
// CONFIGURATION DU SCHEDULER
// =============================================================================

/**
 * Récupère la configuration du scheduler
 */
export async function getSchedulerConfig(): Promise<WebSchedulerConfig> {
  const result = await db.query(
    'SELECT * FROM web_scheduler_config WHERE id = 1'
  )

  const row = result.rows[0]

  return {
    isEnabled: row.is_enabled as boolean,
    maxConcurrentCrawls: row.max_concurrent_crawls as number,
    maxCrawlsPerHour: row.max_crawls_per_hour as number,
    defaultFrequency: row.default_frequency as string,
    scheduleStartHour: row.schedule_start_hour as number,
    scheduleEndHour: row.schedule_end_hour as number,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : null,
    lastRunResult: row.last_run_result as Record<string, unknown> | null,
    totalRuns: row.total_runs as number,
    totalErrors: row.total_errors as number,
  }
}

/**
 * Met à jour la configuration du scheduler
 * Accepte des mises à jour partielles
 */
export async function updateSchedulerConfig(updates: {
  isEnabled?: boolean
  maxConcurrentCrawls?: number
  maxCrawlsPerHour?: number
  scheduleStartHour?: number
  scheduleEndHour?: number
}): Promise<WebSchedulerConfig> {
  const setClauses: string[] = []
  const params: (boolean | number)[] = []
  let paramIndex = 1

  if (updates.isEnabled !== undefined) {
    setClauses.push(`is_enabled = $${paramIndex++}`)
    params.push(updates.isEnabled)
  }

  if (updates.maxConcurrentCrawls !== undefined) {
    setClauses.push(`max_concurrent_crawls = $${paramIndex++}`)
    params.push(updates.maxConcurrentCrawls)
  }

  if (updates.maxCrawlsPerHour !== undefined) {
    setClauses.push(`max_crawls_per_hour = $${paramIndex++}`)
    params.push(updates.maxCrawlsPerHour)
  }

  if (updates.scheduleStartHour !== undefined) {
    setClauses.push(`schedule_start_hour = $${paramIndex++}`)
    params.push(updates.scheduleStartHour)
  }

  if (updates.scheduleEndHour !== undefined) {
    setClauses.push(`schedule_end_hour = $${paramIndex++}`)
    params.push(updates.scheduleEndHour)
  }

  // Si aucune mise à jour, retourner la config actuelle
  if (setClauses.length === 0) {
    return getSchedulerConfig()
  }

  setClauses.push('updated_at = NOW()')

  await db.query(
    `UPDATE web_scheduler_config SET ${setClauses.join(', ')} WHERE id = 1`,
    params
  )

  return getSchedulerConfig()
}

// =============================================================================
// STATUT DU SCHEDULER
// =============================================================================

/**
 * Récupère le statut complet du scheduler
 * Inclut la config, le nombre de sources en attente, les crawls actifs, et le prochain crawl prévu
 */
export async function getSchedulerStatus(): Promise<{
  config: WebSchedulerConfig
  sourcesDue: number
  activeCrawls: number
  nextScheduledCrawl: Date | null
}> {
  // Récupérer la configuration
  const config = await getSchedulerConfig()

  // Compter les sources prêtes à être crawlées
  const sourcesDueResult = await db.query(
    `SELECT COUNT(*) FROM web_sources
     WHERE auto_crawl_enabled = true
       AND next_crawl_at <= NOW()
       AND (scheduler_skip_until IS NULL OR scheduler_skip_until <= NOW())`
  )
  const sourcesDue = parseInt(sourcesDueResult.rows[0].count) || 0

  // Compter les crawls en cours
  const activeCrawlsResult = await db.query(
    `SELECT COUNT(*) FROM web_crawl_jobs WHERE status = 'running'`
  )
  const activeCrawls = parseInt(activeCrawlsResult.rows[0].count) || 0

  // Récupérer le prochain crawl planifié
  const nextCrawlResult = await db.query(
    `SELECT MIN(next_crawl_at) as next_crawl
     FROM web_sources
     WHERE auto_crawl_enabled = true AND is_active = true`
  )
  const nextScheduledCrawl = nextCrawlResult.rows[0].next_crawl
    ? new Date(nextCrawlResult.rows[0].next_crawl as string)
    : null

  return {
    config,
    sourcesDue,
    activeCrawls,
    nextScheduledCrawl,
  }
}

// =============================================================================
// GESTION DES SOURCES
// =============================================================================

/**
 * Active ou désactive le crawl automatique pour une source
 */
export async function toggleSourceAutoCrawl(
  sourceId: string,
  enabled: boolean
): Promise<void> {
  await db.query(
    'UPDATE web_sources SET auto_crawl_enabled = $1 WHERE id = $2',
    [enabled, sourceId]
  )
}

// =============================================================================
// HISTORIQUE DES RUNS
// =============================================================================

/**
 * Enregistre le résultat d'une exécution du scheduler
 */
export async function recordSchedulerRun(result: {
  sourcesProcessed: number
  crawlsStarted: number
  errors: number
}): Promise<void> {
  await db.query(
    `UPDATE web_scheduler_config
     SET last_run_at = NOW(),
         last_run_result = $1,
         total_runs = total_runs + 1,
         total_errors = total_errors + $2
     WHERE id = 1`,
    [JSON.stringify(result), result.errors]
  )
}
