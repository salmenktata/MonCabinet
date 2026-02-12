#!/usr/bin/env tsx
/**
 * Script d'Optimisation Fine des Seuils RAG
 *
 * Analyse les métriques de qualité et recommande des ajustements
 * des seuils et pondérations pour maximiser pertinence/couverture.
 *
 * Usage:
 *   npx tsx scripts/optimize-rag-thresholds.ts                  # Analyse + recommandations
 *   npx tsx scripts/optimize-rag-thresholds.ts --apply          # Appliquer automatiquement
 *   npx tsx scripts/optimize-rag-thresholds.ts --dry-run        # Simulation
 *
 * Paramètres optimisables:
 * - RAG_THRESHOLD_KB (similarité minimum)
 * - RAG_MAX_RESULTS (nombre résultats)
 * - Pondération hybrid (vectoriel vs BM25)
 * - Pondération cross-encoder (neural vs original)
 *
 * Février 2026 - RAG Fine-Tuning
 */

import { pool } from '@/lib/db'
import * as fs from 'fs'

// =============================================================================
// TYPES
// =============================================================================

interface ThresholdRecommendation {
  parameter: string
  currentValue: number | string
  recommendedValue: number | string
  reason: string
  impact: 'low' | 'medium' | 'high'
}

interface OptimizationReport {
  timestamp: Date
  currentMetrics: {
    avgSimilarity: number
    relevantRate: number
    avgResultsCount: number
    latencyP95: number
  }
  recommendations: ThresholdRecommendation[]
  estimatedImpact: {
    similarityGain: number
    relevantGain: number
    latencyChange: number
  }
}

// =============================================================================
// ANALYSE MÉTRIQUES
// =============================================================================

async function analyzeCurrentPerformance() {
  // Stats recherches récentes (7 derniers jours)
  const statsQuery = `
    WITH search_stats AS (
      SELECT
        cm.id,
        jsonb_array_length(cm.kb_results) as results_count,
        (
          SELECT AVG((result->>'similarity')::float)
          FROM jsonb_array_elements(cm.kb_results) AS result
        ) as avg_similarity,
        (
          SELECT COUNT(*)
          FROM jsonb_array_elements(cm.kb_results) AS result
          WHERE (result->>'similarity')::float >= 0.7
        ) as relevant_count
      FROM chat_messages cm
      WHERE cm.created_at >= NOW() - INTERVAL '7 days'
        AND cm.kb_results IS NOT NULL
        AND jsonb_array_length(cm.kb_results) > 0
    )
    SELECT
      AVG(avg_similarity) as avg_similarity,
      AVG(results_count) as avg_results_count,
      AVG(relevant_count::float / NULLIF(results_count, 0)) as relevant_rate,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_similarity) as p50_similarity,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY avg_similarity) as p95_similarity,
      MIN(avg_similarity) as min_similarity,
      MAX(avg_similarity) as max_similarity
    FROM search_stats
  `

  const stats = await pool.query(statsQuery)
  return stats.rows[0]
}

// =============================================================================
// GÉNÉRATION RECOMMANDATIONS
// =============================================================================

function generateRecommendations(metrics: any): ThresholdRecommendation[] {
  const recommendations: ThresholdRecommendation[] = []

  const currentThreshold = parseFloat(process.env.RAG_THRESHOLD_KB || '0.50')
  const avgSimilarity = parseFloat(metrics.avg_similarity) || 0
  const relevantRate = parseFloat(metrics.relevant_rate) || 0
  const avgResultsCount = parseFloat(metrics.avg_results_count) || 0

  // 1. Seuil KB trop bas → trop de noise
  if (relevantRate < 0.6 && avgSimilarity < 0.65) {
    recommendations.push({
      parameter: 'RAG_THRESHOLD_KB',
      currentValue: currentThreshold,
      recommendedValue: Math.min(currentThreshold + 0.05, 0.60),
      reason: `Taux pertinents trop faible (${(relevantRate * 100).toFixed(1)}%), augmenter seuil pour réduire noise`,
      impact: 'high',
    })
  }

  // 2. Seuil KB trop élevé → pas assez de résultats
  if (avgResultsCount < 5 && avgSimilarity > 0.75) {
    recommendations.push({
      parameter: 'RAG_THRESHOLD_KB',
      currentValue: currentThreshold,
      recommendedValue: Math.max(currentThreshold - 0.05, 0.45),
      reason: `Trop peu de résultats (${avgResultsCount.toFixed(1)} avg), abaisser seuil pour augmenter couverture`,
      impact: 'high',
    })
  }

  // 3. Limite résultats insuffisante
  const currentMaxResults = parseInt(process.env.RAG_MAX_RESULTS || '15', 10)
  if (avgResultsCount >= currentMaxResults * 0.9 && relevantRate > 0.7) {
    recommendations.push({
      parameter: 'RAG_MAX_RESULTS',
      currentValue: currentMaxResults,
      recommendedValue: currentMaxResults + 5,
      reason: `Limite souvent atteinte avec bons résultats, augmenter pour plus de contexte`,
      impact: 'medium',
    })
  }

  // 4. Trop de résultats → latence
  if (avgResultsCount > 12 && relevantRate < 0.5) {
    recommendations.push({
      parameter: 'RAG_MAX_RESULTS',
      currentValue: currentMaxResults,
      recommendedValue: Math.max(currentMaxResults - 3, 10),
      reason: `Beaucoup de résultats peu pertinents, réduire pour améliorer latence/qualité`,
      impact: 'medium',
    })
  }

  // 5. Pondération hybrid search (si scores très variables)
  const p95 = parseFloat(metrics.p95_similarity) || 0
  const p50 = parseFloat(metrics.p50_similarity) || 0
  const variance = p95 - p50

  if (variance > 0.3) {
    recommendations.push({
      parameter: 'HYBRID_VECTOR_WEIGHT',
      currentValue: '0.7',
      recommendedValue: '0.75',
      reason: `Variance élevée (${(variance * 100).toFixed(1)}%), augmenter poids vectoriel pour stabilité`,
      impact: 'low',
    })
  }

  // 6. Query expansion (si scores bas sur queries courtes)
  // Note: Nécessiterait tracking spécifique query length vs score
  const enableExpansion = process.env.ENABLE_QUERY_EXPANSION !== 'false'
  if (!enableExpansion && avgSimilarity < 0.65) {
    recommendations.push({
      parameter: 'ENABLE_QUERY_EXPANSION',
      currentValue: 'false',
      recommendedValue: 'true',
      reason: 'Scores bas, activer query expansion pour améliorer pertinence',
      impact: 'high',
    })
  }

  return recommendations
}

// =============================================================================
// ESTIMATION IMPACT
// =============================================================================

function estimateImpact(recommendations: ThresholdRecommendation[]) {
  let similarityGain = 0
  let relevantGain = 0
  let latencyChange = 0

  for (const rec of recommendations) {
    switch (rec.parameter) {
      case 'RAG_THRESHOLD_KB':
        if (rec.recommendedValue > rec.currentValue) {
          similarityGain += 0.03  // +3% avg similarity
          relevantGain += 0.15    // +15% relevant rate
        } else {
          similarityGain -= 0.02  // -2% avg similarity
          relevantGain -= 0.05    // -5% relevant rate
        }
        break

      case 'RAG_MAX_RESULTS':
        if (rec.recommendedValue > rec.currentValue) {
          latencyChange += 500    // +500ms
          relevantGain += 0.05    // +5% relevant count
        } else {
          latencyChange -= 300    // -300ms
        }
        break

      case 'ENABLE_QUERY_EXPANSION':
        if (rec.recommendedValue === 'true') {
          similarityGain += 0.05  // +5% avg similarity
          relevantGain += 0.10    // +10% relevant rate
          latencyChange += 200    // +200ms (LLM call)
        }
        break

      case 'HYBRID_VECTOR_WEIGHT':
        similarityGain += 0.02    // +2% stability
        break
    }
  }

  return { similarityGain, relevantGain, latencyChange }
}

// =============================================================================
// APPLICATION RECOMMANDATIONS
// =============================================================================

function applyRecommendations(
  recommendations: ThresholdRecommendation[],
  dryRun: boolean = false
) {
  if (dryRun) {
    console.log('\n🔍 MODE DRY RUN - Aucune modification appliquée\n')
  } else {
    console.log('\n✏️  APPLICATION DES RECOMMANDATIONS\n')
  }

  const envPath = '.env.local'
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : ''

  for (const rec of recommendations) {
    console.log(`  ${rec.parameter}: ${rec.currentValue} → ${rec.recommendedValue}`)
    console.log(`     Raison: ${rec.reason}`)
    console.log(`     Impact: ${rec.impact}`)

    if (!dryRun) {
      // Mise à jour .env.local
      const regex = new RegExp(`^${rec.parameter}=.*$`, 'm')
      const newLine = `${rec.parameter}=${rec.recommendedValue}`

      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, newLine)
      } else {
        envContent += `\n${newLine}`
      }
    }
  }

  if (!dryRun && recommendations.length > 0) {
    fs.writeFileSync(envPath, envContent)
    console.log(`\n✓ Fichier ${envPath} mis à jour`)
    console.log('⚠️  Redémarrer l\'application pour appliquer les changements')
  }
}

// =============================================================================
// AFFICHAGE RAPPORT
// =============================================================================

function displayReport(report: OptimizationReport) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║        Rapport d'Optimisation RAG - ${report.timestamp.toLocaleDateString('fr-FR')}              ║
╚═══════════════════════════════════════════════════════════════╝

📊 MÉTRIQUES ACTUELLES (7 derniers jours)
  - Score moyen:         ${(report.currentMetrics.avgSimilarity * 100).toFixed(1)}%
  - Taux pertinents:     ${(report.currentMetrics.relevantRate * 100).toFixed(1)}%
  - Résultats moyens:    ${report.currentMetrics.avgResultsCount.toFixed(1)}
  - Latence P95:         ${(report.currentMetrics.latencyP95 / 1000).toFixed(2)}s

🎯 RECOMMANDATIONS (${report.recommendations.length})
`)

  if (report.recommendations.length === 0) {
    console.log('  ✓ Aucune optimisation nécessaire - Performances optimales !\n')
  } else {
    report.recommendations.forEach((rec, i) => {
      const impactIcon = rec.impact === 'high' ? '🔴' : rec.impact === 'medium' ? '🟡' : '🟢'
      console.log(`  ${i + 1}. ${impactIcon} ${rec.parameter}`)
      console.log(`     Actuel: ${rec.currentValue} → Recommandé: ${rec.recommendedValue}`)
      console.log(`     ${rec.reason}\n`)
    })

    console.log(`📈 IMPACT ESTIMÉ
  - Score moyen:         ${report.estimatedImpact.similarityGain >= 0 ? '+' : ''}${(report.estimatedImpact.similarityGain * 100).toFixed(1)}%
  - Taux pertinents:     ${report.estimatedImpact.relevantGain >= 0 ? '+' : ''}${(report.estimatedImpact.relevantGain * 100).toFixed(1)}%
  - Latence:             ${report.estimatedImpact.latencyChange >= 0 ? '+' : ''}${report.estimatedImpact.latencyChange}ms
`)
  }

  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const dryRun = args.includes('--dry-run')

  console.log('🔍 Analyse des performances RAG...\n')

  // Collecter métriques
  const metrics = await analyzeCurrentPerformance()

  if (!metrics || !metrics.avg_similarity) {
    console.log('⚠️  Pas assez de données pour l\'analyse (minimum 7 jours d\'historique requis)')
    console.log('   Réessayez après avoir utilisé le système pendant quelques jours.')
    await pool.end()
    return
  }

  // Générer recommandations
  const recommendations = generateRecommendations(metrics)

  // Estimer impact
  const impact = estimateImpact(recommendations)

  // Construire rapport
  const report: OptimizationReport = {
    timestamp: new Date(),
    currentMetrics: {
      avgSimilarity: parseFloat(metrics.avg_similarity) || 0,
      relevantRate: parseFloat(metrics.relevant_rate) || 0,
      avgResultsCount: parseFloat(metrics.avg_results_count) || 0,
      latencyP95: 0,  // À compléter si disponible
    },
    recommendations,
    estimatedImpact: impact,
  }

  // Afficher rapport
  displayReport(report)

  // Appliquer si demandé
  if (apply || dryRun) {
    applyRecommendations(recommendations, dryRun)
  } else if (recommendations.length > 0) {
    console.log('\n💡 Pour appliquer ces recommandations:')
    console.log('   npx tsx scripts/optimize-rag-thresholds.ts --apply')
    console.log('   npx tsx scripts/optimize-rag-thresholds.ts --dry-run  (simulation)\n')
  }

  await pool.end()
}

main().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
