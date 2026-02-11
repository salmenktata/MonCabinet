/**
 * Script de Test - A/B Testing Prompts (Phase 5.3)
 *
 * Tests :
 * 1. assignVariant() - Assignment consistent hashing
 * 2. calculateVariantMetrics() - Métriques par variant
 * 3. compareVariants() - Comparaison complète
 * 4. checkPromotionEligibility() - Critères promotion
 *
 * Usage: npm run test:ab-testing
 *
 * @module scripts/test-ab-testing
 */

import {
  assignVariant,
  getVariantConfig,
  calculateVariantMetrics,
  compareVariants,
  VARIANT_CONFIGS,
  type PromptVariant,
} from '@/lib/ai/prompt-ab-testing-service'
import { db } from '@/lib/db/postgres'

// =============================================================================
// TESTS
// =============================================================================

async function testAssignmentConsistency() {
  console.log('\n1️⃣ Test Assignment Consistency')

  const testUserId = 'test-user-123'

  // Appeler 5 fois - doit retourner même variant
  const assignments: PromptVariant[] = []
  for (let i = 0; i < 5; i++) {
    const variant = await assignVariant(testUserId)
    assignments.push(variant)
  }

  const allSame = assignments.every(v => v === assignments[0])

  console.log(`  Assignments: ${assignments.join(', ')}`)
  console.log(`  ✅ Consistant: ${allSame}`)

  if (!allSame) {
    throw new Error('Assignment pas consistent')
  }
}

async function testDistribution() {
  console.log('\n2️⃣ Test Distribution 50/25/25')

  const distribution = { control: 0, variant_a: 0, variant_b: 0 }

  // Tester 1000 user IDs
  for (let i = 0; i < 1000; i++) {
    const variant = await assignVariant(`test-user-${i}`)
    distribution[variant]++
  }

  const totalUsers = 1000
  const controlPct = (distribution.control / totalUsers) * 100
  const variantAPct = (distribution.variant_a / totalUsers) * 100
  const variantBPct = (distribution.variant_b / totalUsers) * 100

  console.log(`  Control: ${distribution.control} (${controlPct.toFixed(1)}%, attendu ~50%)`)
  console.log(`  Variant A: ${distribution.variant_a} (${variantAPct.toFixed(1)}%, attendu ~25%)`)
  console.log(`  Variant B: ${distribution.variant_b} (${variantBPct.toFixed(1)}%, attendu ~25%)`)

  // Tolérance ±5%
  const withinTolerance =
    Math.abs(controlPct - 50) < 5 &&
    Math.abs(variantAPct - 25) < 5 &&
    Math.abs(variantBPct - 25) < 5

  console.log(`  ✅ Distribution OK: ${withinTolerance}`)

  if (!withinTolerance) {
    throw new Error('Distribution hors tolérance')
  }
}

async function testMetricsCalculation() {
  console.log('\n3️⃣ Test Metrics Calculation')

  const metrics = await calculateVariantMetrics('control', 30)

  console.log(`  Total Feedbacks: ${metrics.totalFeedbacks}`)
  console.log(`  Satisfaction Rate: ${metrics.satisfactionRate.toFixed(1)}%`)
  console.log(`  Avg Rating: ${metrics.avgRating.toFixed(2)}/5`)
  console.log(`  Citation Accuracy: ${metrics.citationAccuracyRate.toFixed(1)}%`)
  console.log(`  Hallucination Rate: ${metrics.hallucinationRate.toFixed(1)}%`)

  // Validation ranges
  if (
    metrics.satisfactionRate < 0 ||
    metrics.satisfactionRate > 100 ||
    metrics.avgRating < 1 ||
    metrics.avgRating > 5
  ) {
    throw new Error('Métriques hors plage valide')
  }

  console.log(`  ✅ Métriques valides`)
}

async function testComparison() {
  console.log('\n4️⃣ Test Comparison')

  const comparison = await compareVariants(30)

  console.log(`  Control: ${comparison.control.totalFeedbacks} feedbacks`)
  console.log(`  Variant A: ${comparison.variantA.totalFeedbacks} feedbacks`)
  console.log(`  Variant B: ${comparison.variantB.totalFeedbacks} feedbacks`)

  if (comparison.statisticalSignificance.variantA) {
    const sig = comparison.statisticalSignificance.variantA
    console.log(
      `  Variant A vs Control: ${sig.improvement.toFixed(1)}% (p=${sig.pValue.toFixed(4)}, significatif=${sig.significant})`
    )
  }

  if (comparison.statisticalSignificance.variantB) {
    const sig = comparison.statisticalSignificance.variantB
    console.log(
      `  Variant B vs Control: ${sig.improvement.toFixed(1)}% (p=${sig.pValue.toFixed(4)}, significatif=${sig.significant})`
    )
  }

  console.log(`  Recommendations: ${comparison.recommendations.length}`)
  console.log(`  Eligible promotion A: ${comparison.eligibleForPromotion.variantA}`)
  console.log(`  Eligible promotion B: ${comparison.eligibleForPromotion.variantB}`)

  console.log(`  ✅ Comparaison complétée`)
}

async function testVariantConfigs() {
  console.log('\n5️⃣ Test Variant Configs')

  // Vérifier que tous les variants ont config valide
  const variants: PromptVariant[] = ['control', 'variant_a', 'variant_b']

  for (const variant of variants) {
    const config = VARIANT_CONFIGS[variant]
    console.log(`  ${variant}: ${config.name}`)
    console.log(`    Temperature: ${config.temperature}`)
    console.log(`    MaxTokens: ${config.maxTokens}`)
    console.log(`    Weight: ${config.weight}%`)

    if (
      config.temperature < 0 ||
      config.temperature > 1 ||
      config.maxTokens < 1000 ||
      config.maxTokens > 5000
    ) {
      throw new Error(`Config invalide pour ${variant}`)
    }
  }

  // Vérifier que poids totalisent 100
  const totalWeight =
    VARIANT_CONFIGS.control.weight +
    VARIANT_CONFIGS.variant_a.weight +
    VARIANT_CONFIGS.variant_b.weight

  if (totalWeight !== 100) {
    throw new Error(`Total weight invalide: ${totalWeight} (attendu 100)`)
  }

  console.log(`  ✅ Configs valides`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Test A/B Testing Prompts (Phase 5.3)\n')
  console.log('='.repeat(70))

  try {
    await testAssignmentConsistency()
    await testDistribution()
    await testMetricsCalculation()
    await testComparison()
    await testVariantConfigs()

    console.log('\n' + '='.repeat(70))
    console.log('✅ SUCCÈS : Tous les tests sont passés\n')
  } catch (error) {
    console.error('\n💥 ÉCHEC :', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main().catch(error => {
  console.error('💥 Erreur non gérée:', error)
  process.exit(1)
})
