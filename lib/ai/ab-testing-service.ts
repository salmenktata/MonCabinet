/**
 * Service A/B Testing - Test Prompts
 *
 * Permet de comparer l'efficacité de différents prompts système
 *
 * Février 2026 - Task #7
 */

import { db } from '@/lib/db/postgres'

export interface ABTest {
  id: string
  name: string
  description?: string
  targetComponent: string
  status: 'draft' | 'active' | 'paused' | 'completed'
  winnerVariantId?: string
}

export interface ABTestVariant {
  id: string
  testId: string
  name: string
  description?: string
  promptTemplate?: string
  configJson?: Record<string, unknown>
  trafficPercentage: number
}

export interface ABTestStats {
  testId: string
  testName: string
  variantId: string
  variantName: string
  totalResults: number
  thumbsUp: number
  thumbsDown: number
  satisfactionRate: number
  avgCompletionMs: number
  avgTokens: number
  errorRate: number
}

export async function assignVariant(testId: string): Promise<string | null> {
  try {
    const result = await db.query<{ assign_ab_test_variant: string }>(
      'SELECT assign_ab_test_variant($1) as variant_id',
      [testId]
    )
    return result.rows[0]?.assign_ab_test_variant || null
  } catch (error) {
    console.error('[AB Testing] Erreur assign variant:', error)
    return null
  }
}

export async function recordResult(options: {
  testId: string
  variantId: string
  userId?: string
  dossierId?: string
  completionTimeMs?: number
  tokensUsed?: number
  ragScore?: number
  responseLength?: number
  errorOccurred?: boolean
  errorMessage?: string
}): Promise<string | null> {
  try {
    const result = await db.query<{ record_ab_test_result: string }>(
      'SELECT record_ab_test_result($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as result_id',
      [
        options.testId,
        options.variantId,
        options.userId || null,
        options.dossierId || null,
        options.completionTimeMs || null,
        options.tokensUsed || null,
        options.ragScore || null,
        options.responseLength || null,
        options.errorOccurred || false,
        options.errorMessage || null,
      ]
    )
    return result.rows[0]?.record_ab_test_result || null
  } catch (error) {
    console.error('[AB Testing] Erreur record result:', error)
    return null
  }
}

export async function getTestStats(testId: string): Promise<ABTestStats[]> {
  try {
    const result = await db.query<ABTestStats>(
      `SELECT
        test_id as "testId",
        test_name as "testName",
        variant_id as "variantId",
        variant_name as "variantName",
        total_results as "totalResults",
        thumbs_up as "thumbsUp",
        thumbs_down as "thumbsDown",
        satisfaction_rate as "satisfactionRate",
        avg_completion_ms as "avgCompletionMs",
        avg_tokens as "avgTokens",
        error_rate as "errorRate"
      FROM vw_ab_test_stats
      WHERE test_id = $1`,
      [testId]
    )
    return result.rows
  } catch (error) {
    console.error('[AB Testing] Erreur get stats:', error)
    return []
  }
}

export async function getActiveTests(): Promise<ABTest[]> {
  try {
    const result = await db.query<ABTest>(
      `SELECT
        id,
        name,
        description,
        target_component as "targetComponent",
        status
      FROM ab_tests
      WHERE status = 'active'
      ORDER BY created_at DESC`
    )
    return result.rows
  } catch (error) {
    console.error('[AB Testing] Erreur get tests:', error)
    return []
  }
}
