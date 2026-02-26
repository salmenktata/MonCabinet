/**
 * Service de tracking de l'utilisation IA et des coûts
 *
 * Ce service permet de:
 * - Logger chaque opération IA (embedding, chat, génération)
 * - Calculer les coûts estimés
 * - Fournir des statistiques d'utilisation
 */

import { db } from '@/lib/db/postgres'
import { AI_COSTS } from './config'

// =============================================================================
// TYPES
// =============================================================================

export type OperationType =
  | 'embedding'
  | 'chat'
  | 'generation'
  | 'classification'
  | 'extraction'

export type Provider = 'openai' | 'anthropic' | 'ollama' | 'groq' | 'deepseek' | 'gemini'

export interface UsageLog {
  userId: string | null
  operationType: OperationType
  provider: Provider
  model: string
  inputTokens: number
  outputTokens?: number
  context?: Record<string, unknown>
}

export interface UsageStats {
  totalOperations: number
  totalCostUsd: number
  embeddingsCount: number
  chatCount: number
  generationCount: number
  byDay: Array<{
    date: string
    operations: number
    costUsd: number
  }>
}

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Calcule le coût estimé d'une opération
 */
export function calculateCost(
  provider: Provider,
  inputTokens: number,
  outputTokens: number = 0,
  model: string = ''
): number {
  if (provider === 'openai') {
    // text-embedding-3-small: $0.02 / 1M tokens
    return (inputTokens / 1_000_000) * AI_COSTS.embeddingCostPer1MTokens
  } else if (provider === 'deepseek') {
    // deepseek-chat: $0.028/1M input (cache hit system prompt) + $0.42/1M output
    return (
      (inputTokens / 1_000_000) * AI_COSTS.deepseekInputCostPer1MTokens +
      (outputTokens / 1_000_000) * AI_COSTS.deepseekOutputCostPer1MTokens
    )
  } else if (provider === 'anthropic') {
    // NON UTILISÉ EN PROD (dernier fallback théorique uniquement)
    // Claude 3.5 Sonnet: $3 / 1M input, $15 / 1M output
    return (
      (inputTokens / 1_000_000) * AI_COSTS.claudeInputCostPer1MTokens +
      (outputTokens / 1_000_000) * AI_COSTS.claudeOutputCostPer1MTokens
    )
  }
  // Groq : payant si hors free tier (70b : 100K tokens/jour, 1K req/jour | 8b : 500K tokens/jour, 14.4K req/jour)
  if (provider === 'groq') {
    const isSmall = model.includes('8b') || model.includes('instant')
    return isSmall
      ? (inputTokens / 1_000_000) * 0.05  + (outputTokens / 1_000_000) * 0.08
      : (inputTokens / 1_000_000) * 0.59  + (outputTokens / 1_000_000) * 0.79
  }
  // Gemini LLM (embeddings gérés séparément dans gemini-client.ts)
  if (provider === 'gemini') {
    return (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.30
  }
  // Ollama : gratuit (local)
  return 0
}

/**
 * Enregistre une utilisation IA dans la base de données
 */
export async function logUsage(usage: UsageLog): Promise<string> {
  const cost = calculateCost(
    usage.provider,
    usage.inputTokens,
    usage.outputTokens || 0
  )

  const result = await db.query(
    `INSERT INTO ai_usage_logs (
      user_id, operation_type, provider, model,
      input_tokens, output_tokens, estimated_cost_usd, context
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id`,
    [
      usage.userId,
      usage.operationType,
      usage.provider,
      usage.model,
      usage.inputTokens,
      usage.outputTokens || 0,
      cost,
      usage.context ? JSON.stringify(usage.context) : '{}',
    ]
  )

  return result.rows[0].id
}

/**
 * Log simplifié pour les embeddings
 */
export async function logEmbeddingUsage(
  userId: string,
  model: string,
  tokens: number,
  context?: Record<string, unknown>
): Promise<void> {
  await logUsage({
    userId,
    operationType: 'embedding',
    provider: 'openai',
    model,
    inputTokens: tokens,
    context,
  })
}

/**
 * Log simplifié pour le chat
 *
 * @deprecated Février 2026 - Utiliser logUsage() avec provider dynamique.
 * Provider mis à jour Feb 25, 2026 : Groq (migration Ollama→Groq pour scale 1K users).
 */
export async function logChatUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  context?: Record<string, unknown>
): Promise<void> {
  await logUsage({
    userId,
    operationType: 'chat',
    provider: 'groq', // assistant-ia → Groq llama-3.3-70b (migré Feb 25, 2026)
    model,
    inputTokens,
    outputTokens,
    context,
  })
}

/**
 * Log simplifié pour la génération de documents
 *
 * @deprecated Février 2026 - Utiliser logUsage() avec provider dynamique.
 * Cette fonction hardcode 'gemini' (provider primaire depuis Fév 2026).
 */
export async function logGenerationUsage(
  userId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  context?: Record<string, unknown>
): Promise<void> {
  await logUsage({
    userId,
    operationType: 'generation',
    provider: 'gemini',
    model,
    inputTokens,
    outputTokens,
    context,
  })
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Récupère les statistiques d'utilisation pour un utilisateur sur le mois courant
 */
export async function getUserMonthlyStats(userId: string): Promise<UsageStats> {
  const result = await db.query(
    `SELECT
      COUNT(*) as total_operations,
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost_usd,
      COUNT(*) FILTER (WHERE operation_type = 'embedding') as embeddings_count,
      COUNT(*) FILTER (WHERE operation_type = 'chat') as chat_count,
      COUNT(*) FILTER (WHERE operation_type = 'generation') as generation_count
    FROM ai_usage_logs
    WHERE user_id = $1
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
    [userId]
  )

  const stats = result.rows[0]

  // Récupérer les données par jour
  const dailyResult = await db.query(
    `SELECT
      DATE(created_at) as date,
      COUNT(*) as operations,
      COALESCE(SUM(estimated_cost_usd), 0) as cost_usd
    FROM ai_usage_logs
    WHERE user_id = $1
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY DATE(created_at)
    ORDER BY date DESC`,
    [userId]
  )

  return {
    totalOperations: parseInt(stats.total_operations),
    totalCostUsd: parseFloat(stats.total_cost_usd),
    embeddingsCount: parseInt(stats.embeddings_count),
    chatCount: parseInt(stats.chat_count),
    generationCount: parseInt(stats.generation_count),
    byDay: dailyResult.rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      operations: parseInt(row.operations),
      costUsd: parseFloat(row.cost_usd),
    })),
  }
}

/**
 * Récupère les statistiques globales (admin)
 */
export async function getGlobalStats(days: number = 30): Promise<{
  totalCostUsd: number
  totalOperations: number
  costByProvider: Record<string, number>
  costByOperation: Record<string, number>
  dailyTrend: Array<{ date: string; costUsd: number }>
}> {
  const totalResult = await db.query(
    `SELECT
      COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
      COUNT(*) as total_operations
    FROM ai_usage_logs
    WHERE created_at >= CURRENT_DATE - $1::integer`,
    [days]
  )

  const byProviderResult = await db.query(
    `SELECT provider, COALESCE(SUM(estimated_cost_usd), 0) as cost
    FROM ai_usage_logs
    WHERE created_at >= CURRENT_DATE - $1::integer
    GROUP BY provider`,
    [days]
  )

  const byOperationResult = await db.query(
    `SELECT operation_type, COALESCE(SUM(estimated_cost_usd), 0) as cost
    FROM ai_usage_logs
    WHERE created_at >= CURRENT_DATE - $1::integer
    GROUP BY operation_type`,
    [days]
  )

  const dailyResult = await db.query(
    `SELECT DATE(created_at) as date, COALESCE(SUM(estimated_cost_usd), 0) as cost
    FROM ai_usage_logs
    WHERE created_at >= CURRENT_DATE - $1::integer
    GROUP BY DATE(created_at)
    ORDER BY date DESC`,
    [days]
  )

  const costByProvider: Record<string, number> = {}
  byProviderResult.rows.forEach((row) => {
    costByProvider[row.provider] = parseFloat(row.cost)
  })

  const costByOperation: Record<string, number> = {}
  byOperationResult.rows.forEach((row) => {
    costByOperation[row.operation_type] = parseFloat(row.cost)
  })

  return {
    totalCostUsd: parseFloat(totalResult.rows[0].total_cost),
    totalOperations: parseInt(totalResult.rows[0].total_operations),
    costByProvider,
    costByOperation,
    dailyTrend: dailyResult.rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      costUsd: parseFloat(row.cost),
    })),
  }
}

/**
 * Vérifie si un utilisateur a atteint son budget mensuel
 */
export async function checkBudgetLimit(
  userId: string,
  monthlyBudgetUsd: number = 10
): Promise<{ withinBudget: boolean; usedUsd: number; remainingUsd: number }> {
  const result = await db.query(
    `SELECT COALESCE(SUM(estimated_cost_usd), 0) as used
    FROM ai_usage_logs
    WHERE user_id = $1
      AND created_at >= DATE_TRUNC('month', CURRENT_DATE)`,
    [userId]
  )

  const usedUsd = parseFloat(result.rows[0].used)
  const remainingUsd = Math.max(0, monthlyBudgetUsd - usedUsd)

  return {
    withinBudget: usedUsd < monthlyBudgetUsd,
    usedUsd,
    remainingUsd,
  }
}
