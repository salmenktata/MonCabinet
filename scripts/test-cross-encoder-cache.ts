/**
 * Script de test du cache Redis Cross-Encoder
 *
 * Phase 3.4 - Validation cache Redis
 * Objectif: -40% latence (3-5s → 2-3s)
 *
 * Tests:
 * 1. Premier appel (miss cache) → calcul complet
 * 2. Deuxième appel identique (hit cache) → instantané
 * 3. Stats cache (hit rate, temps économisé)
 */

import { rerankWithCrossEncoder, getCacheStats, resetCacheStats, getCrossEncoderInfo } from '../lib/ai/cross-encoder-service'

// =============================================================================
// DONNÉES DE TEST
// =============================================================================

const testQuery = 'ما هي شروط الدفاع الشرعي في القانون التونسي؟'

const testDocuments = [
  'الدفاع الشرعي هو حق مقرر قانونا للشخص للدفاع عن نفسه أو ماله أو نفس الغير أو مال الغير',
  'يشترط لقيام حالة الدفاع الشرعي أن يكون هناك خطر حال على النفس أو المال',
  'القانون الجنائي التونسي يعرف الدفاع الشرعي في الفصل 39 من المجلة الجزائية',
  'لا يعتبر الدفاع الشرعي متوفرا إذا كان التهديد مستقبليا أو متوقعا فقط',
  'يجب أن يكون الدفاع متناسبا مع خطورة الاعتداء',
  'الدفاع المشروع عن النفس هو استثناء من المسؤولية الجنائية',
  'يشترط في الدفاع الشرعي أن يكون الخطر غير مشروع',
  'لا يجوز الدفاع الشرعي ضد عمل مشروع صادر من السلطة',
  'يشترط استحالة اللجوء إلى السلطات العامة لدرء الخطر',
  'الدفاع الشرعي حق طبيعي يسقط المسؤولية الجنائية والمدنية',
]

// =============================================================================
// FONCTION UTILITAIRE
// =============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// TESTS
// =============================================================================

async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║   TEST CACHE REDIS CROSS-ENCODER - PHASE 3.4                 ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log()

  // Reset stats
  resetCacheStats()

  // Info du service
  const info = getCrossEncoderInfo()
  console.log('▓▓▓ CONFIGURATION ▓▓▓')
  console.log(`Modèle: ${info.model}`)
  console.log(`Batch size: ${info.batchSize}`)
  console.log(`Cache activé: ${info.cache.enabled}`)
  console.log(`Cache TTL: ${info.cache.ttl}s`)
  console.log()

  // Test 1: Premier appel (cache MISS)
  console.log('▓▓▓ TEST 1: PREMIER APPEL (CACHE MISS) ▓▓▓')
  const start1 = Date.now()

  const results1 = await rerankWithCrossEncoder(testQuery, testDocuments, 5)

  const duration1 = Date.now() - start1
  console.log(`⏱️  Durée: ${duration1}ms`)
  console.log(`📊 Top 3 résultats:`)
  results1.slice(0, 3).forEach((r, i) => {
    console.log(`   ${i + 1}. Score: ${(r.score * 100).toFixed(1)}% - "${testDocuments[r.index].substring(0, 60)}..."`)
  })
  console.log()

  // Attendre un peu pour bien séparer les appels
  await sleep(100)

  // Test 2: Deuxième appel identique (cache HIT)
  console.log('▓▓▓ TEST 2: DEUXIÈME APPEL IDENTIQUE (CACHE HIT) ▓▓▓')
  const start2 = Date.now()

  const results2 = await rerankWithCrossEncoder(testQuery, testDocuments, 5)

  const duration2 = Date.now() - start2
  console.log(`⏱️  Durée: ${duration2}ms`)
  console.log(`📊 Top 3 résultats:`)
  results2.slice(0, 3).forEach((r, i) => {
    console.log(`   ${i + 1}. Score: ${(r.score * 100).toFixed(1)}% - "${testDocuments[r.index].substring(0, 60)}..."`)
  })
  console.log()

  // Vérifier que les résultats sont identiques
  const resultsMatch = JSON.stringify(results1) === JSON.stringify(results2)
  console.log(`✓ Résultats identiques: ${resultsMatch ? 'OUI ✅' : 'NON ❌'}`)
  console.log()

  // Test 3: Stats cache
  console.log('▓▓▓ TEST 3: STATISTIQUES CACHE ▓▓▓')
  const stats = getCacheStats()
  console.log(`Cache hits: ${stats.hits}`)
  console.log(`Cache misses: ${stats.misses}`)
  console.log(`Cache errors: ${stats.errors}`)
  console.log(`Hit rate: ${stats.hitRate}`)
  console.log()

  // Analyse performances
  console.log('▓▓▓ ANALYSE PERFORMANCES ▓▓▓')
  const speedup = ((duration1 - duration2) / duration1) * 100
  const targetSpeedup = 40 // Objectif -40% latence
  const success = speedup >= targetSpeedup

  console.log(`Durée sans cache: ${duration1}ms`)
  console.log(`Durée avec cache: ${duration2}ms`)
  console.log(`Gain de temps: ${speedup.toFixed(1)}%`)
  console.log()

  // Résumé final
  console.log('══════════════════════════════════════════════════════════════')
  console.log('RÉSUMÉ')
  console.log('══════════════════════════════════════════════════════════════')
  console.log(`Objectif Phase 3.4: -40% latence`)
  console.log(`Résultat mesuré: -${speedup.toFixed(1)}% latence`)
  console.log()

  if (success) {
    console.log('✅ OBJECTIF ATTEINT - Cache Redis opérationnel!')
    console.log(`   Latence réduite de ${speedup.toFixed(1)}% (objectif: ${targetSpeedup}%)`)
  } else {
    console.log(`⚠️  OBJECTIF NON ATTEINT - ${speedup.toFixed(1)}% < ${targetSpeedup}%`)
    console.log('   Note: Le premier appel inclut le chargement du modèle (~3-5s)')
    console.log('   Exécuter le test 2× pour voir le vrai gain du cache')
  }
  console.log()

  // Recommandations
  console.log('▓▓▓ RECOMMANDATIONS ▓▓▓')
  if (speedup < 10) {
    console.log('⚠️  Cache Redis peut-être pas activé ou connecté')
    console.log('   Vérifier REDIS_CACHE_ENABLED et connexion Redis')
  } else if (speedup >= 80) {
    console.log('✅ Cache extrêmement performant (>80% gain)')
    console.log('   Considérer augmenter TTL pour maximiser hits')
  } else if (speedup >= 40) {
    console.log('✅ Cache performant - Objectif atteint')
  }

  process.exit(success ? 0 : 1)
}

// =============================================================================
// EXÉCUTION
// =============================================================================

runTests().catch((error) => {
  console.error('❌ ERREUR TEST:', error)
  process.exit(1)
})
