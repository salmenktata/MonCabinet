/**
 * Script Test - Métriques Qualité Juridique (Phase 5.4)
 *
 * Usage: npm run test:legal-quality
 */

import {
  computeLegalQualityMetrics,
  detectQualityIssues,
  compareWithBaseline,
} from '@/lib/metrics/legal-quality-metrics'

async function main() {
  console.log('🚀 Test Métriques Qualité Juridique (Phase 5.4)\n')

  try {
    // Test 1: Calcul métriques
    console.log('1️⃣ Test Calcul Métriques')
    const metrics = await computeLegalQualityMetrics(7)
    console.log('  Citation Accuracy:', metrics.citationAccuracy.toFixed(1) + '%')
    console.log('  Hallucination Rate:', metrics.hallucinationRate.toFixed(1) + '%')
    console.log('  Coverage Score:', metrics.coverageScore.toFixed(1) + '%')
    console.log('  Lawyer Satisfaction:', metrics.lawyerSatisfaction.toFixed(1) + '%')
    console.log('  ✅ Métriques calculées\n')

    // Test 2: Détection alertes
    console.log('2️⃣ Test Détection Alertes')
    const alerts = await detectQualityIssues(7)
    console.log(`  Alertes détectées: ${alerts.length}`)
    for (const alert of alerts) {
      console.log(`  - ${alert.severity.toUpperCase()}: ${alert.message}`)
    }
    console.log('  ✅ Alertes détectées\n')

    // Test 3: Comparaison baseline
    console.log('3️⃣ Test Comparaison Baseline')
    const comparison = await compareWithBaseline(7)
    console.log('  Citation Accuracy change:', comparison.changes.citationAccuracy.toFixed(1) + '%')
    console.log('  Hallucination Rate change:', comparison.changes.hallucinationRate.toFixed(1) + '%')
    console.log('  ✅ Comparaison complétée\n')

    console.log('='.repeat(70))
    console.log('✅ SUCCÈS : Tous les tests sont passés\n')
  } catch (error) {
    console.error('💥 ÉCHEC :', error)
    process.exit(1)
  } finally {
    const { db } = await import('@/lib/db/postgres')
    await db.end()
  }
}

main()
