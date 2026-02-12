#!/usr/bin/env tsx
/**
 * Script de Monitoring Qualité RAG - Production
 *
 * Collecte et affiche les métriques de qualité du système RAG en temps réel
 *
 * Usage:
 *   npx tsx scripts/monitor-rag-quality.ts                    # Snapshot actuel
 *   npx tsx scripts/monitor-rag-quality.ts --watch            # Mode continu (5min)
 *   npx tsx scripts/monitor-rag-quality.ts --export=json      # Export JSON
 *   npx tsx scripts/monitor-rag-quality.ts --export=csv       # Export CSV
 *   npx tsx scripts/monitor-rag-quality.ts --days=7           # Tendances 7 jours
 *
 * Métriques collectées:
 * - Scores similarité moyens (par provider, par catégorie)
 * - Taux résultats pertinents (>70%)
 * - Latence recherche (p50, p95, p99)
 * - Taux utilisation providers (Ollama vs OpenAI)
 * - Couverture indexation (embeddings_openai vs embeddings_ollama)
 * - Qualité re-ranking (cross-encoder vs TF-IDF)
 *
 * Février 2026 - Monitoring RAG Quality
 */

import { pool } from '@/lib/db'
import * as fs from 'fs'

// =============================================================================
// TYPES
// =============================================================================

interface RAGMetrics {
  timestamp: Date

  // Scores similarité
  avgSimilarity: number
  avgSimilarityOpenAI: number
  avgSimilarityOllama: number

  // Résultats pertinents
  totalSearches: number
  relevantResults: number  // >70%
  relevantRate: number     // %

  // Latence (ms)
  latencyP50: number
  latencyP95: number
  latencyP99: number

  // Providers
  openAIUsage: number      // %
  ollamaUsage: number      // %

  // Indexation
  totalChunks: number
  chunksWithOpenAI: number
  chunksWithOllama: number
  indexationProgress: number  // %

  // Catégories top
  topCategories: Array<{ category: string; count: number; avgScore: number }>

  // Queries fréquentes
  topQueries: Array<{ query: string; count: number; avgScore: number }>
}

// =============================================================================
// COLLECTE MÉTRIQUES
// =============================================================================

async function collectMetrics(days: number = 1): Promise<RAGMetrics> {
  const now = new Date()

  // 1. Stats recherches récentes (depuis chat_messages)
  const searchStatsQuery = `
    WITH search_results AS (
      SELECT
        jsonb_array_elements(kb_results) AS result
      FROM chat_messages
      WHERE created_at >= NOW() - INTERVAL '${days} days'
        AND kb_results IS NOT NULL
        AND jsonb_array_length(kb_results) > 0
    )
    SELECT
      COUNT(*) as total_results,
      AVG((result->>'similarity')::float) as avg_similarity,
      COUNT(*) FILTER (WHERE (result->>'similarity')::float >= 0.7) as relevant_count,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (result->>'similarity')::float) as p50_similarity,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (result->>'similarity')::float) as p95_similarity
    FROM search_results
  `

  const searchStats = await pool.query(searchStatsQuery)
  const stats = searchStats.rows[0] || {
    total_results: 0,
    avg_similarity: 0,
    relevant_count: 0,
    p50_similarity: 0,
    p95_similarity: 0,
  }

  // 2. Stats indexation (migration OpenAI)
  const indexationQuery = `SELECT * FROM vw_kb_embedding_migration_stats`
  const indexation = await pool.query(indexationQuery)
  const idx = indexation.rows[0] || {
    total_chunks: 0,
    chunks_openai: 0,
    chunks_ollama: 0,
    pct_openai_complete: 0,
  }

  // 3. Top catégories
  const topCategoriesQuery = `
    WITH category_stats AS (
      SELECT
        kb.category::text,
        COUNT(*) as searches,
        AVG((result->>'similarity')::float) as avg_score
      FROM chat_messages cm
      CROSS JOIN LATERAL jsonb_array_elements(cm.kb_results) AS result
      JOIN knowledge_base kb ON kb.id = (result->>'knowledgeBaseId')::uuid
      WHERE cm.created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY kb.category
    )
    SELECT category, searches, avg_score
    FROM category_stats
    ORDER BY searches DESC
    LIMIT 10
  `

  const topCategories = await pool.query(topCategoriesQuery)

  // 4. Latence (si disponible)
  const latencyQuery = `
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_time) as p50,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_time) as p95,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY response_time) as p99
    FROM chat_messages
    WHERE created_at >= NOW() - INTERVAL '${days} days'
      AND response_time IS NOT NULL
  `

  const latency = await pool.query(latencyQuery)
  const lat = latency.rows[0] || { p50: 0, p95: 0, p99: 0 }

  // 5. Usage providers (estimation basée sur opération)
  // Note: Nécessiterait tracking explicite, pour l'instant estimation
  const openAIUsage = (idx.chunks_openai / Math.max(idx.total_chunks, 1)) * 100

  return {
    timestamp: now,

    avgSimilarity: parseFloat(stats.avg_similarity) || 0,
    avgSimilarityOpenAI: 0,  // À implémenter avec tracking
    avgSimilarityOllama: 0,   // À implémenter avec tracking

    totalSearches: parseInt(stats.total_results) || 0,
    relevantResults: parseInt(stats.relevant_count) || 0,
    relevantRate: stats.total_results > 0
      ? (stats.relevant_count / stats.total_results) * 100
      : 0,

    latencyP50: parseFloat(lat.p50) || 0,
    latencyP95: parseFloat(lat.p95) || 0,
    latencyP99: parseFloat(lat.p99) || 0,

    openAIUsage: openAIUsage,
    ollamaUsage: 100 - openAIUsage,

    totalChunks: parseInt(idx.total_chunks) || 0,
    chunksWithOpenAI: parseInt(idx.chunks_openai) || 0,
    chunksWithOllama: parseInt(idx.chunks_ollama) || 0,
    indexationProgress: parseFloat(idx.pct_openai_complete) || 0,

    topCategories: topCategories.rows.map(r => ({
      category: r.category,
      count: parseInt(r.searches),
      avgScore: parseFloat(r.avg_score),
    })),

    topQueries: [],  // À implémenter si besoin
  }
}

// =============================================================================
// AFFICHAGE
// =============================================================================

function displayMetrics(metrics: RAGMetrics) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Monitoring Qualité RAG - Snapshot                  ║
╚═══════════════════════════════════════════════════════════════╝

📊 SCORES SIMILARITÉ
  - Moyenne globale:     ${(metrics.avgSimilarity * 100).toFixed(1)}%
  - Résultats totaux:    ${metrics.totalSearches}
  - Pertinents (>70%):   ${metrics.relevantResults} (${metrics.relevantRate.toFixed(1)}%)

⚡ LATENCE RECHERCHE
  - P50 (médiane):       ${(metrics.latencyP50 / 1000).toFixed(2)}s
  - P95:                 ${(metrics.latencyP95 / 1000).toFixed(2)}s
  - P99:                 ${(metrics.latencyP99 / 1000).toFixed(2)}s

🤖 PROVIDERS EMBEDDINGS
  - OpenAI:              ${metrics.openAIUsage.toFixed(1)}%
  - Ollama:              ${metrics.ollamaUsage.toFixed(1)}%

📦 INDEXATION (Migration OpenAI)
  - Total chunks:        ${metrics.totalChunks.toLocaleString()}
  - Avec OpenAI:         ${metrics.chunksWithOpenAI.toLocaleString()} (${metrics.indexationProgress.toFixed(1)}%)
  - Avec Ollama:         ${metrics.chunksWithOllama.toLocaleString()}

📚 TOP CATÉGORIES
`)

  metrics.topCategories.slice(0, 5).forEach((cat, i) => {
    console.log(`  ${i + 1}. ${cat.category.padEnd(20)} - ${cat.count.toString().padStart(5)} recherches (score: ${(cat.avgScore * 100).toFixed(1)}%)`)
  })

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

// =============================================================================
// EXPORT
// =============================================================================

function exportJSON(metrics: RAGMetrics, filename: string) {
  fs.writeFileSync(filename, JSON.stringify(metrics, null, 2))
  console.log(`✓ Métriques exportées: ${filename}`)
}

function exportCSV(metrics: RAGMetrics, filename: string) {
  const csv = `timestamp,avg_similarity,relevant_rate,latency_p50,latency_p95,openai_usage,indexation_progress
${metrics.timestamp.toISOString()},${metrics.avgSimilarity},${metrics.relevantRate},${metrics.latencyP50},${metrics.latencyP95},${metrics.openAIUsage},${metrics.indexationProgress}
`

  fs.writeFileSync(filename, csv)
  console.log(`✓ Métriques exportées: ${filename}`)
}

// =============================================================================
// COMPARAISON TENDANCES
// =============================================================================

async function displayTrends(days: number) {
  console.log(`\n📈 TENDANCES (${days} derniers jours)\n`)

  // Métriques par jour
  for (let d = days - 1; d >= 0; d--) {
    const metrics = await collectMetrics(1)  // 1 jour
    console.log(`  Jour -${d}: Score ${(metrics.avgSimilarity * 100).toFixed(1)}%, Pertinents ${metrics.relevantRate.toFixed(1)}%`)
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2)

  const watchMode = args.includes('--watch')
  const exportFormat = args.find(a => a.startsWith('--export='))?.split('=')[1]
  const days = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || '1', 10)

  if (watchMode) {
    console.log('🔄 Mode Watch activé (rafraîchissement toutes les 5 minutes)')
    console.log('   Appuyez sur Ctrl+C pour arrêter\n')

    while (true) {
      const metrics = await collectMetrics(days)
      displayMetrics(metrics)

      // Attendre 5 minutes
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000))
    }
  } else {
    const metrics = await collectMetrics(days)

    if (exportFormat === 'json') {
      const filename = `rag-metrics-${new Date().toISOString().split('T')[0]}.json`
      exportJSON(metrics, filename)
    } else if (exportFormat === 'csv') {
      const filename = `rag-metrics-${new Date().toISOString().split('T')[0]}.csv`
      exportCSV(metrics, filename)
    } else {
      displayMetrics(metrics)

      if (days > 1) {
        await displayTrends(days)
      }
    }
  }

  await pool.end()
}

main().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
