#!/usr/bin/env tsx
/**
 * Benchmark Phase 1 PostgreSQL Optimizations
 *
 * Ce script teste l'impact des optimisations Phase 1:
 * 1. Materialized View metadata (mv_kb_metadata_enriched)
 * 2. Indexes partiels langue (idx_kb_chunks_tsvector_ar/fr)
 * 3. Autovacuum optimisé (dead tuples <5%)
 *
 * Usage:
 *   npx tsx scripts/benchmark-phase1-optimizations.ts
 *   npx tsx scripts/benchmark-phase1-optimizations.ts --iterations=20
 *   npx tsx scripts/benchmark-phase1-optimizations.ts --verbose
 *
 * Métriques Succès:
 * - Latence P50: <1.5s (vs 2-3s avant)
 * - Latence P95: <3s (vs 5-8s avant)
 * - Scores similarité: >70% pour 80%+ requêtes
 * - Dead tuples: <5%
 */

import { searchKnowledgeBase } from '@/lib/ai/knowledge-base-service'
import { db } from '@/lib/db/postgres'

// =============================================================================
// CONFIGURATION
// =============================================================================

const ITERATIONS = parseInt(process.env.BENCHMARK_ITERATIONS || '10', 10)
const VERBOSE = process.argv.includes('--verbose') || process.env.VERBOSE === 'true'

// Queries représentatives du trafic réel (70% arabe, 30% français)
const TEST_QUERIES = [
  // Arabe (70% trafic)
  { query: 'ما هي شروط الدفاع الشرعي في القانون التونسي', category: 'codes', language: 'ar' },
  { query: 'قانون الالتزامات والعقود المادة 103', category: 'legislation', language: 'ar' },
  { query: 'قرار محكمة التعقيب في القضايا المدنية', category: 'jurisprudence', language: 'ar' },
  { query: 'عقد الكراء التجاري في تونس', category: 'codes', language: 'ar' },
  { query: 'الطعن بالنقض في القضايا الجزائية', category: 'jurisprudence', language: 'ar' },
  { query: 'حقوق المستهلك في القانون التونسي', category: 'legislation', language: 'ar' },
  { query: 'شروط صحة البيع', category: 'codes', language: 'ar' },

  // Français (30% trafic)
  { query: 'code des obligations et des contrats article 103', category: 'legislation', language: 'fr' },
  { query: 'jurisprudence cassation civile divorce', category: 'jurisprudence', language: 'fr' },
  { query: 'bail commercial en tunisie', category: 'codes', language: 'fr' },
]

// =============================================================================
// TYPES
// =============================================================================

interface BenchmarkResult {
  query: string
  category: string
  language: string
  latency: number
  resultsCount: number
  avgSimilarity: number
  maxSimilarity: number
  minSimilarity: number
  relevantCount: number // Scores >70%
  provider?: string
}

interface AggregatedStats {
  totalQueries: number
  p50Latency: number
  p95Latency: number
  p99Latency: number
  avgLatency: number
  avgResultsCount: number
  avgSimilarity: number
  relevantPct: number // % résultats >70%
  deadTuplesPct: number
  mvStalenessHours: number
  cacheHitRate: number
}

// =============================================================================
// HELPERS
// =============================================================================

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, index)]
}

function avg(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// =============================================================================
// BENCHMARK FONCTIONS
// =============================================================================

async function runSingleQuery(
  query: string,
  category: string,
  language: string
): Promise<BenchmarkResult> {
  const start = Date.now()

  const results = await searchKnowledgeBase(query, {
    category,
    limit: 15,
    threshold: 0.5, // Seuil bas pour capturer plus de résultats
  })

  const latency = Date.now() - start

  const similarities = results.map((r: any) => r.similarity || 0)
  const avgSimilarity = similarities.length > 0 ? avg(similarities) : 0
  const relevantCount = results.filter((r: any) => (r.similarity || 0) >= 0.7).length

  return {
    query,
    category,
    language,
    latency,
    resultsCount: results.length,
    avgSimilarity,
    maxSimilarity: Math.max(...similarities, 0),
    minSimilarity: Math.min(...similarities, 1),
    relevantCount,
  }
}

async function getDatabaseMetrics(): Promise<{
  deadTuplesPct: number
  mvStalenessHours: number
  cacheHitRate: number
}> {
  try {
    // Dead tuples percentage
    const bloatResult = await db.query(`
      SELECT
        COALESCE(
          ROUND(100.0 * SUM(n_dead_tup)::float / NULLIF(SUM(n_live_tup + n_dead_tup), 0), 2),
          0
        ) as dead_pct
      FROM pg_stat_user_tables
      WHERE tablename IN ('knowledge_base', 'knowledge_base_chunks')
    `)

    // MV staleness
    const mvResult = await db.query(`
      SELECT EXTRACT(EPOCH FROM (NOW() - last_refresh)) / 3600 as staleness_hours
      FROM pg_stat_user_tables
      JOIN pg_matviews ON tablename = matviewname
      WHERE tablename = 'mv_kb_metadata_enriched'
    `)

    // Cache hit rate
    const cacheResult = await db.query(`
      SELECT ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 1) as cache_hit_pct
      FROM pg_stat_database WHERE datname = current_database()
    `)

    return {
      deadTuplesPct: parseFloat(bloatResult.rows[0]?.dead_pct || '0'),
      mvStalenessHours: parseFloat(mvResult.rows[0]?.staleness_hours || '0'),
      cacheHitRate: parseFloat(cacheResult.rows[0]?.cache_hit_pct || '0'),
    }
  } catch (error) {
    console.warn('[Metrics] Erreur récupération métriques DB:', error)
    return { deadTuplesPct: 0, mvStalenessHours: 0, cacheHitRate: 0 }
  }
}

// =============================================================================
// MAIN BENCHMARK
// =============================================================================

async function runBenchmark() {
  console.log('🚀 Benchmark Phase 1 PostgreSQL Optimizations\n')
  console.log(`Configuration:`)
  console.log(`  - Iterations: ${ITERATIONS}`)
  console.log(`  - Queries: ${TEST_QUERIES.length}`)
  console.log(`  - Verbose: ${VERBOSE}`)
  console.log(`  - USE_KB_METADATA_MV: ${process.env.USE_KB_METADATA_MV !== 'false' ? 'true' : 'false'}`)
  console.log('')

  const allResults: BenchmarkResult[] = []

  // Warmup (1 query pour charger caches)
  console.log('⏳ Warmup (1 query)...')
  await runSingleQuery(
    TEST_QUERIES[0].query,
    TEST_QUERIES[0].category,
    TEST_QUERIES[0].language
  )

  console.log('\n📊 Exécution benchmark...\n')

  // Run benchmark pour chaque query
  for (const testCase of TEST_QUERIES) {
    if (VERBOSE) {
      console.log(`\n🔍 Query: "${testCase.query.substring(0, 50)}..."`)
    }

    const iterationResults: BenchmarkResult[] = []

    for (let i = 0; i < ITERATIONS; i++) {
      const result = await runSingleQuery(
        testCase.query,
        testCase.category,
        testCase.language
      )

      iterationResults.push(result)
      allResults.push(result)

      if (VERBOSE) {
        console.log(
          `  [${i + 1}/${ITERATIONS}] ${result.latency}ms | ` +
            `${result.resultsCount} résultats | ` +
            `Avg similarity: ${(result.avgSimilarity * 100).toFixed(1)}% | ` +
            `Relevant: ${result.relevantCount}`
        )
      }
    }

    // Stats par query
    const latencies = iterationResults.map((r) => r.latency)
    const avgLatency = avg(latencies)
    const p50 = median(latencies)
    const avgSimil = avg(iterationResults.map((r) => r.avgSimilarity))

    if (!VERBOSE) {
      console.log(
        `✓ ${testCase.language.toUpperCase()} - ${testCase.category}: ` +
          `P50=${p50}ms, Avg=${avgLatency.toFixed(0)}ms, ` +
          `Similarity=${(avgSimil * 100).toFixed(1)}%`
      )
    }
  }

  // ==========================================================================
  // AGGREGATED STATS
  // ==========================================================================

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📈 RÉSULTATS GLOBAUX')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const latencies = allResults.map((r) => r.latency)
  const similarities = allResults.map((r) => r.avgSimilarity)
  const relevantCounts = allResults.map((r) => r.relevantCount)
  const totalRelevant = relevantCounts.reduce((sum, c) => sum + c, 0)
  const totalResults = allResults.reduce((sum, r) => sum + r.resultsCount, 0)

  const stats: AggregatedStats = {
    totalQueries: allResults.length,
    p50Latency: median(latencies),
    p95Latency: percentile(latencies, 0.95),
    p99Latency: percentile(latencies, 0.99),
    avgLatency: avg(latencies),
    avgResultsCount: totalResults / allResults.length,
    avgSimilarity: avg(similarities),
    relevantPct: (totalRelevant / totalResults) * 100,
    ...(await getDatabaseMetrics()),
  }

  // Latences
  console.log('⚡ Performance Latence:')
  console.log(`  P50: ${stats.p50Latency}ms ${getLatencyStatus(stats.p50Latency, 1500)}`)
  console.log(`  P95: ${stats.p95Latency}ms ${getLatencyStatus(stats.p95Latency, 3000)}`)
  console.log(`  P99: ${stats.p99Latency}ms ${getLatencyStatus(stats.p99Latency, 5000)}`)
  console.log(`  Avg: ${stats.avgLatency.toFixed(0)}ms`)

  // Qualité
  console.log('\n🎯 Qualité Recherche:')
  console.log(
    `  Similarité moyenne: ${(stats.avgSimilarity * 100).toFixed(1)}% ${getQualityStatus(stats.avgSimilarity)}`
  )
  console.log(
    `  Résultats pertinents (>70%): ${stats.relevantPct.toFixed(1)}% ${getRelevanceStatus(stats.relevantPct)}`
  )
  console.log(`  Résultats moyens/requête: ${stats.avgResultsCount.toFixed(1)}`)

  // Santé DB
  console.log('\n💾 Santé PostgreSQL:')
  console.log(
    `  Dead tuples: ${stats.deadTuplesPct.toFixed(1)}% ${getBloatStatus(stats.deadTuplesPct)}`
  )
  console.log(
    `  MV staleness: ${stats.mvStalenessHours.toFixed(1)}h ${getStalenessStatus(stats.mvStalenessHours)}`
  )
  console.log(
    `  Cache hit rate: ${stats.cacheHitRate.toFixed(1)}% ${getCacheStatus(stats.cacheHitRate)}`
  )

  // ==========================================================================
  // OBJECTIFS PHASE 1
  // ==========================================================================

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🎯 OBJECTIFS PHASE 1')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const objectives = [
    {
      name: 'Latence P50 <1.5s',
      target: 1500,
      actual: stats.p50Latency,
      achieved: stats.p50Latency < 1500,
    },
    {
      name: 'Latence P95 <3s',
      target: 3000,
      actual: stats.p95Latency,
      achieved: stats.p95Latency < 3000,
    },
    {
      name: 'Dead tuples <5%',
      target: 5,
      actual: stats.deadTuplesPct,
      achieved: stats.deadTuplesPct < 5,
    },
    {
      name: 'Cache hit >70%',
      target: 70,
      actual: stats.cacheHitRate,
      achieved: stats.cacheHitRate > 70,
    },
    {
      name: 'MV staleness <24h',
      target: 24,
      actual: stats.mvStalenessHours,
      achieved: stats.mvStalenessHours < 24,
    },
    {
      name: 'Résultats pertinents >80%',
      target: 80,
      actual: stats.relevantPct,
      achieved: stats.relevantPct > 80,
    },
  ]

  let achievedCount = 0
  for (const obj of objectives) {
    const status = obj.achieved ? '✅' : '❌'
    achievedCount += obj.achieved ? 1 : 0
    console.log(`${status} ${obj.name}: ${obj.actual.toFixed(1)} (objectif: ${obj.target})`)
  }

  console.log(`\n🏆 Score: ${achievedCount}/${objectives.length} objectifs atteints`)

  if (achievedCount === objectives.length) {
    console.log('\n🎉 SUCCÈS TOTAL - Phase 1 optimisations validées!')
  } else if (achievedCount >= objectives.length * 0.7) {
    console.log('\n✅ SUCCÈS PARTIEL - Objectifs principaux atteints')
  } else {
    console.log('\n⚠️  ÉCHEC - Optimisations insuffisantes, envisager Phase 2 (RediSearch)')
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

// =============================================================================
// HELPERS STATUS
// =============================================================================

function getLatencyStatus(latency: number, target: number): string {
  if (latency < target) return '🟢 Excellent'
  if (latency < target * 1.2) return '🟡 Acceptable'
  return '🔴 Échec'
}

function getQualityStatus(similarity: number): string {
  if (similarity > 0.8) return '🟢 Excellent'
  if (similarity > 0.7) return '🟡 Bon'
  return '🔴 Faible'
}

function getRelevanceStatus(pct: number): string {
  if (pct > 80) return '🟢 Excellent'
  if (pct > 70) return '🟡 Acceptable'
  return '🔴 Insuffisant'
}

function getBloatStatus(pct: number): string {
  if (pct < 5) return '🟢 Propre'
  if (pct < 10) return '🟡 Acceptable'
  return '🔴 Bloat critique'
}

function getStalenessStatus(hours: number): string {
  if (hours < 1) return '🟢 Frais'
  if (hours < 24) return '🟡 Acceptable'
  return '🔴 Périmé'
}

function getCacheStatus(pct: number): string {
  if (pct > 90) return '🟢 Excellent'
  if (pct > 70) return '🟡 Acceptable'
  return '🔴 Faible'
}

// =============================================================================
// MAIN
// =============================================================================

runBenchmark()
  .then(() => {
    console.log('✅ Benchmark terminé avec succès')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Erreur benchmark:', error)
    process.exit(1)
  })
