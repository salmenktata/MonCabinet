/**
 * Service de métriques RAG
 *
 * Collecte et expose des métriques pour le monitoring du système RAG:
 * - Latence (recherche, LLM, total) — in-memory, fenêtre glissante 1h
 * - Tokens (input, output)
 * - Erreurs (embeddings, LLM, cache) — persistées dans Redis (survive aux restarts)
 * - Cache hit rate
 * - Distribution des sources
 * - Compteurs de requêtes totales — persistés dans Redis
 *
 * Stratégie de persistance :
 * - Compteurs agrégés (INCR) → Redis, TTL 7 jours, survive aux redémarrages
 * - Buffer de latence → in-memory uniquement (percentiles 1h glissante)
 */

import { getRedisClient, isRedisAvailable } from '@/lib/cache/redis'

// =============================================================================
// TYPES
// =============================================================================

export interface RAGMetricEntry {
  timestamp: number
  searchTimeMs: number
  llmTimeMs: number
  totalTimeMs: number
  inputTokens: number
  outputTokens: number
  resultsCount: number
  cacheHit: boolean
  degradedMode: boolean
  provider: string
  error?: string
}

export interface RAGMetricsSummary {
  period: {
    start: number
    end: number
    durationMs: number
  }
  requests: {
    total: number
    successful: number
    failed: number
    degraded: number
  }
  latency: {
    search: { p50: number; p95: number; p99: number; avg: number }
    llm: { p50: number; p95: number; p99: number; avg: number }
    total: { p50: number; p95: number; p99: number; avg: number }
  }
  tokens: {
    inputTotal: number
    outputTotal: number
    avgPerRequest: number
  }
  cache: {
    hits: number
    misses: number
    hitRate: number
  }
  providers: Record<string, number>
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Fenêtre de rétention des métriques (1 heure par défaut)
// Augmenté de 15min à 1h pour détecter les tendances et anomalies
const METRICS_RETENTION_MS = parseInt(process.env.RAG_METRICS_RETENTION_MS || '3600000', 10)

// Taille max du buffer (éviter memory leak)
const MAX_METRICS_BUFFER = 1000

// =============================================================================
// STOCKAGE EN MÉMOIRE
// =============================================================================

const metricsBuffer: RAGMetricEntry[] = []

// Compteurs séparés pour les erreurs (pas de perte en cas de rotation)
const errorCounters = {
  embedding: 0,
  llm: 0,
  search: 0,
  cache: 0,
  total: 0,
}

// =============================================================================
// PERSISTENCE REDIS — compteurs agrégés (survive aux redémarrages)
// =============================================================================

const REDIS_METRICS_PREFIX = 'rag:metrics'
const REDIS_METRICS_TTL_S = 86400 * 7 // 7 jours

/** Clés Redis pour les compteurs persistés */
const REDIS_COUNTER_KEYS = {
  requestsTotal: `${REDIS_METRICS_PREFIX}:requests:total`,
  requestsSuccess: `${REDIS_METRICS_PREFIX}:requests:success`,
  requestsFailed: `${REDIS_METRICS_PREFIX}:requests:failed`,
  errorsEmbedding: `${REDIS_METRICS_PREFIX}:errors:embedding`,
  errorsLlm: `${REDIS_METRICS_PREFIX}:errors:llm`,
  errorsSearch: `${REDIS_METRICS_PREFIX}:errors:search`,
  errorsCache: `${REDIS_METRICS_PREFIX}:errors:cache`,
  tokensInput: `${REDIS_METRICS_PREFIX}:tokens:input`,
  tokensOutput: `${REDIS_METRICS_PREFIX}:tokens:output`,
}

/**
 * Incrémente des compteurs Redis de façon non-bloquante (fire-and-forget).
 * Les erreurs sont silencieuses pour ne pas perturber le flux principal.
 */
function persistCountersToRedis(
  updates: Partial<Record<keyof typeof REDIS_COUNTER_KEYS, number>>
): void {
  if (!isRedisAvailable()) return

  getRedisClient()
    .then(async (client) => {
      if (!client) return
      const pipeline = client.multi()
      for (const [key, delta] of Object.entries(updates) as [keyof typeof REDIS_COUNTER_KEYS, number][]) {
        if (delta > 0) {
          pipeline.incrBy(REDIS_COUNTER_KEYS[key], delta)
          pipeline.expire(REDIS_COUNTER_KEYS[key], REDIS_METRICS_TTL_S)
        }
      }
      await pipeline.exec()
    })
    .catch(() => {
      // Silent fail — les métriques Redis ne doivent jamais bloquer le service
    })
}

/**
 * Lit les compteurs persistés depuis Redis.
 * Retourne des zéros si Redis indisponible.
 */
export async function getPersistedCounters(): Promise<{
  requestsTotal: number
  requestsSuccess: number
  requestsFailed: number
  errors: { embedding: number; llm: number; search: number; cache: number }
  tokens: { input: number; output: number }
}> {
  const defaults = {
    requestsTotal: 0,
    requestsSuccess: 0,
    requestsFailed: 0,
    errors: { embedding: 0, llm: 0, search: 0, cache: 0 },
    tokens: { input: 0, output: 0 },
  }

  if (!isRedisAvailable()) return defaults

  try {
    const client = await getRedisClient()
    if (!client) return defaults

    const values = await client.mGet(Object.values(REDIS_COUNTER_KEYS))
    const parse = (v: string | null) => parseInt(v || '0', 10)

    return {
      requestsTotal: parse(values[0]),
      requestsSuccess: parse(values[1]),
      requestsFailed: parse(values[2]),
      errors: {
        embedding: parse(values[3]),
        llm: parse(values[4]),
        search: parse(values[5]),
        cache: parse(values[6]),
      },
      tokens: {
        input: parse(values[7]),
        output: parse(values[8]),
      },
    }
  } catch {
    return defaults
  }
}

// =============================================================================
// COLLECTE
// =============================================================================

/**
 * Enregistre une métrique de requête RAG
 */
export function recordRAGMetric(entry: Omit<RAGMetricEntry, 'timestamp'>): void {
  const now = Date.now()

  metricsBuffer.push({
    ...entry,
    timestamp: now,
  })

  // Nettoyer les anciennes entrées
  pruneOldMetrics(now)

  // Limiter la taille du buffer
  if (metricsBuffer.length > MAX_METRICS_BUFFER) {
    metricsBuffer.splice(0, metricsBuffer.length - MAX_METRICS_BUFFER)
  }

  // Compter les erreurs (in-memory)
  const isError = !!entry.error
  if (isError) {
    errorCounters.total++
    if (entry.error!.includes('embedding')) errorCounters.embedding++
    else if (entry.error!.includes('llm') || entry.error!.includes('LLM')) errorCounters.llm++
    else if (entry.error!.includes('search')) errorCounters.search++
    else if (entry.error!.includes('cache')) errorCounters.cache++
  }

  // Persister les compteurs clés dans Redis (non-bloquant, fire-and-forget)
  persistCountersToRedis({
    requestsTotal: 1,
    requestsSuccess: isError ? 0 : 1,
    requestsFailed: isError ? 1 : 0,
    tokensInput: entry.inputTokens,
    tokensOutput: entry.outputTokens,
  })
}

/**
 * Enregistre une erreur d'embedding (in-memory + Redis)
 */
export function recordEmbeddingError(): void {
  errorCounters.embedding++
  errorCounters.total++
  persistCountersToRedis({ errorsEmbedding: 1 })
}

/**
 * Enregistre une erreur de cache (in-memory + Redis)
 */
export function recordCacheError(): void {
  errorCounters.cache++
  errorCounters.total++
  persistCountersToRedis({ errorsCache: 1 })
}

/**
 * Nettoie les métriques expirées.
 * O(n) : findIndex + splice(0, k) au lieu de k appels à shift() (O(k*n)).
 */
function pruneOldMetrics(now: number): void {
  const cutoff = now - METRICS_RETENTION_MS
  const firstValid = metricsBuffer.findIndex((m) => m.timestamp >= cutoff)
  if (firstValid === -1) {
    // Tout est expiré
    metricsBuffer.length = 0
  } else if (firstValid > 0) {
    metricsBuffer.splice(0, firstValid)
  }
}

// =============================================================================
// CALCULS STATISTIQUES
// =============================================================================

/**
 * Calcule les percentiles d'un tableau de nombres
 */
function calculatePercentiles(values: number[]): { p50: number; p95: number; p99: number; avg: number } {
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const len = sorted.length

  const p50Index = Math.floor(len * 0.5)
  const p95Index = Math.floor(len * 0.95)
  const p99Index = Math.floor(len * 0.99)

  const sum = sorted.reduce((acc, val) => acc + val, 0)

  return {
    p50: sorted[p50Index] || 0,
    p95: sorted[Math.min(p95Index, len - 1)] || 0,
    p99: sorted[Math.min(p99Index, len - 1)] || 0,
    avg: Math.round(sum / len),
  }
}

// =============================================================================
// EXPORT DES MÉTRIQUES
// =============================================================================

/**
 * Génère un résumé des métriques RAG
 */
export function getRAGMetricsSummary(periodMs?: number): RAGMetricsSummary {
  const now = Date.now()
  const period = periodMs || METRICS_RETENTION_MS
  const cutoff = now - period

  // Filtrer les métriques de la période
  const periodMetrics = metricsBuffer.filter((m) => m.timestamp >= cutoff)

  // Calculer les stats
  const searchTimes = periodMetrics.map((m) => m.searchTimeMs)
  const llmTimes = periodMetrics.map((m) => m.llmTimeMs)
  const totalTimes = periodMetrics.map((m) => m.totalTimeMs)

  const successful = periodMetrics.filter((m) => !m.error)
  const failed = periodMetrics.filter((m) => !!m.error)
  const degraded = periodMetrics.filter((m) => m.degradedMode)

  const cacheHits = periodMetrics.filter((m) => m.cacheHit).length
  const cacheMisses = periodMetrics.length - cacheHits

  const inputTokens = periodMetrics.reduce((acc, m) => acc + m.inputTokens, 0)
  const outputTokens = periodMetrics.reduce((acc, m) => acc + m.outputTokens, 0)

  // Distribution des providers
  const providers: Record<string, number> = {}
  for (const m of periodMetrics) {
    providers[m.provider] = (providers[m.provider] || 0) + 1
  }

  return {
    period: {
      start: cutoff,
      end: now,
      durationMs: period,
    },
    requests: {
      total: periodMetrics.length,
      successful: successful.length,
      failed: failed.length,
      degraded: degraded.length,
    },
    latency: {
      search: calculatePercentiles(searchTimes),
      llm: calculatePercentiles(llmTimes),
      total: calculatePercentiles(totalTimes),
    },
    tokens: {
      inputTotal: inputTokens,
      outputTotal: outputTokens,
      avgPerRequest: periodMetrics.length > 0
        ? Math.round((inputTokens + outputTokens) / periodMetrics.length)
        : 0,
    },
    cache: {
      hits: cacheHits,
      misses: cacheMisses,
      hitRate: periodMetrics.length > 0
        ? Math.round((cacheHits / periodMetrics.length) * 100)
        : 0,
    },
    providers,
  }
}

/**
 * Retourne les compteurs d'erreurs
 */
export function getErrorCounters(): typeof errorCounters {
  return { ...errorCounters }
}

/**
 * Réinitialise les compteurs d'erreurs
 */
export function resetErrorCounters(): void {
  errorCounters.embedding = 0
  errorCounters.llm = 0
  errorCounters.search = 0
  errorCounters.cache = 0
  errorCounters.total = 0
}

/**
 * Retourne les métriques brutes (pour debug/export)
 */
export function getRawMetrics(limit?: number): RAGMetricEntry[] {
  const entries = [...metricsBuffer].reverse()
  return limit ? entries.slice(0, limit) : entries
}

/**
 * Génère un log structuré pour les métriques (compatible avec logging structuré)
 */
export function logMetricsSummary(): void {
  const summary = getRAGMetricsSummary()
  console.log('RAG_METRICS_SUMMARY', JSON.stringify({
    requests: summary.requests,
    latencyP95: {
      search: summary.latency.search.p95,
      llm: summary.latency.llm.p95,
      total: summary.latency.total.p95,
    },
    cacheHitRate: summary.cache.hitRate,
    tokensTotal: summary.tokens.inputTotal + summary.tokens.outputTotal,
    providers: summary.providers,
    errors: getErrorCounters(),
  }))
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Vérifie si le système RAG est sain selon les métriques
 */
export function checkRAGHealth(): {
  healthy: boolean
  warnings: string[]
  critical: string[]
} {
  const summary = getRAGMetricsSummary(60000) // Dernière minute
  const warnings: string[] = []
  const critical: string[] = []

  // Vérifier latence P95
  if (summary.latency.total.p95 > 10000) {
    critical.push(`Latence P95 critique: ${summary.latency.total.p95}ms > 10s`)
  } else if (summary.latency.total.p95 > 5000) {
    warnings.push(`Latence P95 élevée: ${summary.latency.total.p95}ms`)
  }

  // Vérifier taux d'erreur
  if (summary.requests.total > 0) {
    const errorRate = (summary.requests.failed / summary.requests.total) * 100
    if (errorRate > 10) {
      critical.push(`Taux d'erreur critique: ${errorRate.toFixed(1)}% > 10%`)
    } else if (errorRate > 5) {
      warnings.push(`Taux d'erreur élevé: ${errorRate.toFixed(1)}%`)
    }
  }

  // Vérifier cache hit rate
  if (summary.cache.hitRate < 30 && summary.requests.total > 10) {
    warnings.push(`Cache hit rate bas: ${summary.cache.hitRate}% < 30%`)
  }

  // Vérifier mode dégradé
  if (summary.requests.degraded > summary.requests.total * 0.2) {
    warnings.push(`Mode dégradé fréquent: ${summary.requests.degraded}/${summary.requests.total}`)
  }

  return {
    healthy: critical.length === 0,
    warnings,
    critical,
  }
}

// =============================================================================
// MÉTRIQUES COMPARATIVES PAR PIPELINE
// =============================================================================

/** Pipelines instrumentés */
export type RAGPipeline = 'chat' | 'kb_search'

export interface PipelineMetricEvent {
  pipeline: RAGPipeline
  /** true si la requête n'a retourné aucune réponse (abstention/no_results) */
  abstention?: boolean
  /** true si le cache Redis était chaud pour cette requête */
  cacheHit?: boolean
  /** Nombre de sources retournées dans la réponse */
  sourcesCount?: number
  /** Score de similarité moyen des sources retournées (0-1) */
  avgSimilarity?: number
  /** Latence totale en ms */
  latencyMs?: number
  /** true si le quality gate a bloqué la réponse */
  qualityGateTriggered?: boolean
  /** true si le routeur juridique a échoué */
  routerFailed?: boolean
}

const PIPELINE_REDIS_PREFIX = 'metrics:pipeline'
const PIPELINE_REDIS_TTL_S = 86400 * 7 // 7 jours

/**
 * Enregistre un événement de pipeline dans Redis (hash journalier).
 * Non-bloquant — fire-and-forget.
 *
 * Clé Redis : `metrics:pipeline:{pipeline}:{YYYY-MM-DD}`
 * Champs : total_requests, abstentions, cache_hits, total_sources, total_similarity,
 *          quality_gate_triggered, router_failed, total_latency_ms, request_count_latency
 */
export function recordPipelineMetric(event: PipelineMetricEvent): void {
  if (!isRedisAvailable()) return

  const dateKey = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const redisKey = `${PIPELINE_REDIS_PREFIX}:${event.pipeline}:${dateKey}`

  getRedisClient()
    .then(async (client) => {
      if (!client) return
      const pipe = client.multi()
      pipe.hIncrBy(redisKey, 'total_requests', 1)
      if (event.abstention) pipe.hIncrBy(redisKey, 'abstentions', 1)
      if (event.cacheHit) pipe.hIncrBy(redisKey, 'cache_hits', 1)
      if (event.sourcesCount !== undefined) pipe.hIncrByFloat(redisKey, 'total_sources', event.sourcesCount)
      if (event.avgSimilarity !== undefined) pipe.hIncrByFloat(redisKey, 'total_similarity', event.avgSimilarity)
      if (event.qualityGateTriggered) pipe.hIncrBy(redisKey, 'quality_gate_triggered', 1)
      if (event.routerFailed) pipe.hIncrBy(redisKey, 'router_failed', 1)
      if (event.latencyMs !== undefined) {
        pipe.hIncrByFloat(redisKey, 'total_latency_ms', event.latencyMs)
        pipe.hIncrBy(redisKey, 'request_count_latency', 1)
      }
      pipe.expire(redisKey, PIPELINE_REDIS_TTL_S)
      await pipe.exec()
    })
    .catch(() => {
      // Silent fail
    })
}

/** Résumé d'une journée pour un pipeline */
export interface PipelineDaySummary {
  date: string
  pipeline: RAGPipeline
  totalRequests: number
  abstentionRate: number
  cacheHitRate: number
  avgSourcesCount: number
  avgSimilarity: number
  avgLatencyMs: number
  qualityGateRate: number
  routerFailedRate: number
}

/**
 * Lit les métriques de pipeline pour les N derniers jours depuis Redis.
 */
export async function getPipelineMetrics(
  pipeline: RAGPipeline,
  days = 7
): Promise<PipelineDaySummary[]> {
  if (!isRedisAvailable()) return []

  try {
    const client = await getRedisClient()
    if (!client) return []

    const summaries: PipelineDaySummary[] = []
    const now = new Date()

    for (let i = 0; i < days; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateKey = d.toISOString().slice(0, 10)
      const redisKey = `${PIPELINE_REDIS_PREFIX}:${pipeline}:${dateKey}`

      const raw = await client.hGetAll(redisKey)
      if (!raw || Object.keys(raw).length === 0) continue

      const parse = (k: string) => parseFloat(raw[k] || '0')
      const total = Math.max(parse('total_requests'), 1)
      const latencyCount = Math.max(parse('request_count_latency'), 1)

      summaries.push({
        date: dateKey,
        pipeline,
        totalRequests: parse('total_requests'),
        abstentionRate: parse('abstentions') / total,
        cacheHitRate: parse('cache_hits') / total,
        avgSourcesCount: parse('total_sources') / total,
        avgSimilarity: parse('total_similarity') / total,
        avgLatencyMs: parse('total_latency_ms') / latencyCount,
        qualityGateRate: parse('quality_gate_triggered') / total,
        routerFailedRate: parse('router_failed') / total,
      })
    }

    return summaries.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

// =============================================================================
// EXPORT FORMAT PROMETHEUS (optionnel)
// =============================================================================

/**
 * Génère les métriques au format Prometheus
 */
export function getPrometheusMetrics(): string {
  const summary = getRAGMetricsSummary()
  const errors = getErrorCounters()

  const lines: string[] = [
    '# HELP rag_requests_total Total number of RAG requests',
    '# TYPE rag_requests_total counter',
    `rag_requests_total{status="success"} ${summary.requests.successful}`,
    `rag_requests_total{status="failed"} ${summary.requests.failed}`,
    `rag_requests_total{status="degraded"} ${summary.requests.degraded}`,
    '',
    '# HELP rag_latency_seconds RAG request latency in seconds',
    '# TYPE rag_latency_seconds summary',
    `rag_latency_seconds{quantile="0.5",phase="search"} ${summary.latency.search.p50 / 1000}`,
    `rag_latency_seconds{quantile="0.95",phase="search"} ${summary.latency.search.p95 / 1000}`,
    `rag_latency_seconds{quantile="0.5",phase="llm"} ${summary.latency.llm.p50 / 1000}`,
    `rag_latency_seconds{quantile="0.95",phase="llm"} ${summary.latency.llm.p95 / 1000}`,
    `rag_latency_seconds{quantile="0.5",phase="total"} ${summary.latency.total.p50 / 1000}`,
    `rag_latency_seconds{quantile="0.95",phase="total"} ${summary.latency.total.p95 / 1000}`,
    '',
    '# HELP rag_tokens_total Total tokens used',
    '# TYPE rag_tokens_total counter',
    `rag_tokens_total{type="input"} ${summary.tokens.inputTotal}`,
    `rag_tokens_total{type="output"} ${summary.tokens.outputTotal}`,
    '',
    '# HELP rag_cache_hit_ratio Cache hit ratio',
    '# TYPE rag_cache_hit_ratio gauge',
    `rag_cache_hit_ratio ${summary.cache.hitRate / 100}`,
    '',
    '# HELP rag_errors_total Total errors by type',
    '# TYPE rag_errors_total counter',
    `rag_errors_total{type="embedding"} ${errors.embedding}`,
    `rag_errors_total{type="llm"} ${errors.llm}`,
    `rag_errors_total{type="search"} ${errors.search}`,
    `rag_errors_total{type="cache"} ${errors.cache}`,
  ]

  return lines.join('\n')
}
