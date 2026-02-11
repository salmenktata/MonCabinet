/**
 * Script de test: API Legal Quality Metrics
 *
 * Test l'API /api/admin/legal-quality/metrics pour debugger
 */

import { computeLegalQualityMetrics, compareWithBaseline } from '@/lib/metrics/legal-quality-metrics'

async function main() {
  console.log('🧪 Test API Legal Quality Metrics\n')

  try {
    console.log('1️⃣ Test computeLegalQualityMetrics()...')
    const metrics = await computeLegalQualityMetrics(7, false)
    console.log('✅ Métriques calculées:')
    console.log(JSON.stringify(metrics, null, 2))
    console.log('')

    console.log('2️⃣ Test compareWithBaseline()...')
    const comparison = await compareWithBaseline(7)
    console.log('✅ Comparaison calculée:')
    console.log(JSON.stringify(comparison, null, 2))
    console.log('')

    console.log('✅ Tous les tests passés!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Erreur:', error)
    console.error(error)
    process.exit(1)
  }
}

main()
