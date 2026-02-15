/**
 * Service de Monitoring IA par Opération
 *
 * Phase 5 optionnelle - À implémenter selon les besoins
 *
 * Permet de suivre :
 * - Latence par opération
 * - Coût par opération
 * - Taux de succès par provider
 * - Fallback usage
 */

import { type OperationName } from './operations-config'
import { type LLMProvider } from './llm-fallback-service'

// =============================================================================
// TYPES
// =============================================================================

export interface OperationMetrics {
  operationName: OperationName
  provider: LLMProvider
  latency: number
  tokensUsed: number
  success: boolean
  fallbackUsed: boolean
  error?: string
  timestamp: Date
}

export interface OperationStats {
  operationName: OperationName
  totalCalls: number
  successRate: number
  avgLatency: number
  totalTokens: number
  estimatedCost: number
  providers: {
    [provider: string]: {
      calls: number
      successRate: number
      avgLatency: number
    }
  }
}

// =============================================================================
// STORAGE (en mémoire pour l'instant, à migrer vers DB)
// =============================================================================

const metricsBuffer: OperationMetrics[] = []
const MAX_BUFFER_SIZE = 1000

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Enregistre une métrique d'opération IA
 *
 * À appeler dans llm-fallback-service.ts après chaque appel LLM
 *
 * @example
 * await logOperationMetric({
 *   operationName: 'assistant-ia',
 *   provider: 'groq',
 *   latency: 292,
 *   tokensUsed: 450,
 *   success: true,
 *   fallbackUsed: false,
 * })
 */
export async function logOperationMetric(metric: Omit<OperationMetrics, 'timestamp'>): Promise<void> {
  const fullMetric: OperationMetrics = {
    ...metric,
    timestamp: new Date(),
  }

  metricsBuffer.push(fullMetric)

  // Nettoyer le buffer si trop grand
  if (metricsBuffer.length > MAX_BUFFER_SIZE) {
    metricsBuffer.shift()
  }

  // Log console pour debug
  if (process.env.NODE_ENV === 'development') {
    console.log(
      `[OpMetrics] ${metric.operationName} | ${metric.provider} | ${metric.latency}ms | ` +
      `${metric.tokensUsed} tokens | ${metric.success ? '✓' : '✗'} ${metric.fallbackUsed ? '(fallback)' : ''}`
    )
  }

  // TODO: Persister en DB (table ai_operation_metrics)
  // await db.query(`
  //   INSERT INTO ai_operation_metrics (
  //     operation_name, provider, latency_ms, tokens_used,
  //     success, fallback_used, error, created_at
  //   ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  // `, [
  //   metric.operationName, metric.provider, metric.latency, metric.tokensUsed,
  //   metric.success, metric.fallbackUsed, metric.error || null
  // ])
}

// =============================================================================
// STATISTIQUES
// =============================================================================

/**
 * Calcule les statistiques pour une opération donnée
 *
 * @param operationName - Nom de l'opération
 * @param timeWindowHours - Fenêtre temporelle en heures (par défaut 24h)
 */
export function getOperationStats(
  operationName: OperationName,
  timeWindowHours: number = 24
): OperationStats {
  const cutoffTime = new Date()
  cutoffTime.setHours(cutoffTime.getHours() - timeWindowHours)

  // Filtrer les métriques de cette opération dans la fenêtre
  const metrics = metricsBuffer.filter(
    m => m.operationName === operationName && m.timestamp >= cutoffTime
  )

  if (metrics.length === 0) {
    return {
      operationName,
      totalCalls: 0,
      successRate: 0,
      avgLatency: 0,
      totalTokens: 0,
      estimatedCost: 0,
      providers: {},
    }
  }

  // Calculer stats globales
  const successCount = metrics.filter(m => m.success).length
  const totalLatency = metrics.reduce((sum, m) => sum + m.latency, 0)
  const totalTokens = metrics.reduce((sum, m) => sum + m.tokensUsed, 0)

  // Calculer stats par provider
  const providerStats: Record<string, { calls: number; successRate: number; avgLatency: number }> = {}

  const providers = [...new Set(metrics.map(m => m.provider))]
  for (const provider of providers) {
    const providerMetrics = metrics.filter(m => m.provider === provider)
    const providerSuccess = providerMetrics.filter(m => m.success).length

    providerStats[provider] = {
      calls: providerMetrics.length,
      successRate: providerSuccess / providerMetrics.length,
      avgLatency: providerMetrics.reduce((sum, m) => sum + m.latency, 0) / providerMetrics.length,
    }
  }

  // Estimer le coût (basé sur les tokens)
  const estimatedCost = estimateCost(totalTokens, operationName)

  return {
    operationName,
    totalCalls: metrics.length,
    successRate: successCount / metrics.length,
    avgLatency: totalLatency / metrics.length,
    totalTokens,
    estimatedCost,
    providers: providerStats,
  }
}

/**
 * Récupère les statistiques pour toutes les opérations
 */
export function getAllOperationsStats(timeWindowHours: number = 24): OperationStats[] {
  const operations: OperationName[] = ['indexation', 'assistant-ia', 'dossiers-assistant', 'dossiers-consultation']
  return operations.map(op => getOperationStats(op, timeWindowHours))
}

// =============================================================================
// ESTIMATION COÛT
// =============================================================================

/**
 * Estime le coût en euros pour un nombre de tokens donné
 *
 * Prix approximatifs (février 2026) :
 * - Groq : Gratuit
 * - Gemini : Gratuit (sous quota)
 * - DeepSeek : ~$0.14/M tokens ($0.00000014/token)
 * - Anthropic : ~$3/M tokens ($0.000003/token)
 * - OpenAI : ~$0.02/M tokens embeddings ($0.00000002/token)
 */
function estimateCost(tokens: number, operationName: OperationName): number {
  // Prix moyens par opération (basé sur les providers configurés)
  const pricePerToken: Record<OperationName, number> = {
    'indexation': 0, // Ollama uniquement (gratuit)
    'assistant-ia': 0, // Groq gratuit
    'dossiers-assistant': 0.00000002, // OpenAI embeddings seulement (~$0.02/1M tokens)
    'dossiers-consultation': 0.00000002, // OpenAI embeddings seulement
    'kb-quality-analysis': 0, // Gemini gratuit
    'query-classification': 0, // Groq gratuit
    'query-expansion': 0, // Groq gratuit
  }

  return tokens * pricePerToken[operationName]
}

// =============================================================================
// EXPORT MÉTRIQUES (pour dashboard)
// =============================================================================

/**
 * Exporte les métriques brutes pour analyse externe
 *
 * @returns Métriques brutes (pour export CSV/JSON)
 */
export function exportMetrics(timeWindowHours: number = 24): OperationMetrics[] {
  const cutoffTime = new Date()
  cutoffTime.setHours(cutoffTime.getHours() - timeWindowHours)

  return metricsBuffer.filter(m => m.timestamp >= cutoffTime)
}

/**
 * Format les statistiques pour affichage console/logs
 */
export function formatStatsReport(stats: OperationStats[]): string {
  const lines: string[] = []

  lines.push('\n' + '='.repeat(80))
  lines.push('📊 AI OPERATIONS STATISTICS')
  lines.push('='.repeat(80))

  for (const stat of stats) {
    lines.push(`\n🎯 ${stat.operationName.toUpperCase()}`)
    lines.push(`  Total Calls: ${stat.totalCalls}`)
    lines.push(`  Success Rate: ${(stat.successRate * 100).toFixed(1)}%`)
    lines.push(`  Avg Latency: ${stat.avgLatency.toFixed(0)}ms`)
    lines.push(`  Total Tokens: ${stat.totalTokens.toLocaleString()}`)
    lines.push(`  Estimated Cost: €${stat.estimatedCost.toFixed(4)}`)

    if (Object.keys(stat.providers).length > 0) {
      lines.push(`  Providers:`)
      for (const [provider, pStat] of Object.entries(stat.providers)) {
        lines.push(
          `    - ${provider}: ${pStat.calls} calls, ${(pStat.successRate * 100).toFixed(1)}% success, ${pStat.avgLatency.toFixed(0)}ms avg`
        )
      }
    }
  }

  // Total coût
  const totalCost = stats.reduce((sum, s) => sum + s.estimatedCost, 0)
  lines.push('\n' + '-'.repeat(80))
  lines.push(`💰 Total Estimated Cost: €${totalCost.toFixed(4)}`)
  lines.push('='.repeat(80) + '\n')

  return lines.join('\n')
}

// =============================================================================
// API ROUTE EXAMPLE (à implémenter)
// =============================================================================

/**
 * Exemple de route API pour dashboard monitoring
 *
 * GET /api/admin/operations-metrics?hours=24
 *
 * @example
 * // app/api/admin/operations-metrics/route.ts
 * export async function GET(request: Request) {
 *   const { searchParams } = new URL(request.url)
 *   const hours = parseInt(searchParams.get('hours') || '24', 10)
 *
 *   const stats = getAllOperationsStats(hours)
 *   const report = formatStatsReport(stats)
 *
 *   return NextResponse.json({
 *     stats,
 *     report,
 *     exportUrl: `/api/admin/operations-metrics/export?hours=${hours}`,
 *   })
 * }
 */
