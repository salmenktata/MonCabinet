/**
 * Service de gestion des tentatives de retry du pipeline
 * Tracking détaillé des tentatives de replay par étape
 */

import { db } from '@/lib/db/postgres'

export interface RetryAttempt {
  id: string
  knowledge_base_id: string
  stage: string
  attempt_number: number
  triggered_by: string | null
  triggered_at: string
  status: 'pending' | 'running' | 'success' | 'failed'
  error_message: string | null
  duration_ms: number | null
  retry_reason: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface RetryStats {
  total: number
  succeeded: number
  failed: number
  success_rate: number
  top_errors: Array<{
    stage: string
    error: string
    count: number
  }>
}

/**
 * Créer une nouvelle tentative de retry
 */
export async function createRetryAttempt(
  documentId: string,
  stage: string,
  userId: string,
  reason?: string
): Promise<string> {
  // Récupérer le dernier numéro de tentative pour ce document et cette étape
  const lastAttempt = await db.query(
    `SELECT MAX(attempt_number) as max_attempt
     FROM pipeline_retry_attempts
     WHERE knowledge_base_id = $1 AND stage = $2`,
    [documentId, stage]
  )

  const attemptNumber = (lastAttempt.rows[0]?.max_attempt || 0) + 1

  const result = await db.query(
    `INSERT INTO pipeline_retry_attempts
      (knowledge_base_id, stage, attempt_number, triggered_by, status, retry_reason)
     VALUES ($1, $2, $3, $4, 'running', $5)
     RETURNING id`,
    [documentId, stage, attemptNumber, userId, reason || 'Manual replay']
  )

  return result.rows[0].id
}

/**
 * Mettre à jour le résultat d'une tentative
 */
export async function updateRetryAttempt(
  attemptId: string,
  status: 'success' | 'failed',
  durationMs?: number,
  errorMessage?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.query(
    `UPDATE pipeline_retry_attempts
     SET status = $1,
         duration_ms = $2,
         error_message = $3,
         metadata = $4,
         updated_at = NOW()
     WHERE id = $5`,
    [
      status,
      durationMs,
      errorMessage,
      metadata ? JSON.stringify(metadata) : null,
      attemptId
    ]
  )
}

/**
 * Récupérer les tentatives pour un document
 */
export async function getDocumentRetryAttempts(
  documentId: string,
  stage?: string
): Promise<RetryAttempt[]> {
  const query = stage
    ? `SELECT * FROM pipeline_retry_attempts
       WHERE knowledge_base_id = $1 AND stage = $2
       ORDER BY triggered_at DESC`
    : `SELECT * FROM pipeline_retry_attempts
       WHERE knowledge_base_id = $1
       ORDER BY triggered_at DESC`

  const params = stage ? [documentId, stage] : [documentId]
  const result = await db.query(query, params)

  return result.rows.map(row => ({
    ...row,
    metadata: row.metadata || {}
  }))
}

/**
 * Récupérer les statistiques de retry sur une période
 */
export async function getRetryStats(hours: number = 24): Promise<RetryStats> {
  const result = await db.query(
    `SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as succeeded,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0),
        2
      ) as success_rate
    FROM pipeline_retry_attempts
    WHERE triggered_at >= NOW() - INTERVAL '${hours} hours'`
  )

  // Top erreurs
  const errorsResult = await db.query(
    `SELECT
      stage,
      LEFT(error_message, 100) as error,
      COUNT(*) as count
    FROM pipeline_retry_attempts
    WHERE triggered_at >= NOW() - INTERVAL '${hours} hours'
      AND status = 'failed'
      AND error_message IS NOT NULL
    GROUP BY stage, LEFT(error_message, 100)
    ORDER BY count DESC
    LIMIT 5`
  )

  const stats = result.rows[0] || {
    total: 0,
    succeeded: 0,
    failed: 0,
    success_rate: 0
  }

  return {
    ...stats,
    total: parseInt(stats.total),
    succeeded: parseInt(stats.succeeded),
    failed: parseInt(stats.failed),
    success_rate: parseFloat(stats.success_rate || '0'),
    top_errors: errorsResult.rows.map(row => ({
      stage: row.stage,
      error: row.error,
      count: parseInt(row.count)
    }))
  }
}

/**
 * Récupérer les statistiques de retry par étape
 */
export async function getRetryStatsByStage(hours: number = 24): Promise<Record<string, RetryStats>> {
  const result = await db.query(
    `SELECT
      stage,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'success') as succeeded,
      COUNT(*) FILTER (WHERE status = 'failed') as failed,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE status = 'success') / NULLIF(COUNT(*), 0),
        2
      ) as success_rate
    FROM pipeline_retry_attempts
    WHERE triggered_at >= NOW() - INTERVAL '${hours} hours'
    GROUP BY stage`
  )

  const statsByStage: Record<string, RetryStats> = {}

  result.rows.forEach(row => {
    statsByStage[row.stage] = {
      total: parseInt(row.total),
      succeeded: parseInt(row.succeeded),
      failed: parseInt(row.failed),
      success_rate: parseFloat(row.success_rate || '0'),
      top_errors: []
    }
  })

  return statsByStage
}

/**
 * Nettoyer les anciennes tentatives (rétention 30 jours)
 */
export async function cleanupOldRetryAttempts(daysToKeep: number = 30): Promise<number> {
  const result = await db.query(
    `DELETE FROM pipeline_retry_attempts
     WHERE triggered_at < NOW() - INTERVAL '${daysToKeep} days'
     RETURNING id`
  )

  return result.rowCount || 0
}
