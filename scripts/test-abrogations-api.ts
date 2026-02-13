#!/usr/bin/env tsx
/**
 * Test des Routes API Abrogations Juridiques
 *
 * Usage: npx tsx scripts/test-abrogations-api.ts [base-url]
 *
 * Exemples:
 *   npx tsx scripts/test-abrogations-api.ts                     # Localhost (http://localhost:7002)
 *   npx tsx scripts/test-abrogations-api.ts https://qadhya.tn   # Production
 */

const BASE_URL = process.argv[2] || 'http://localhost:7002'

interface TestResult {
  name: string
  status: 'success' | 'error'
  duration: number
  message?: string
  data?: any
}

const results: TestResult[] = []

async function test(
  name: string,
  url: string,
  expectedStatus: number = 200
): Promise<TestResult> {
  const start = Date.now()

  try {
    const response = await fetch(url)
    const duration = Date.now() - start

    if (response.status !== expectedStatus) {
      return {
        name,
        status: 'error',
        duration,
        message: `Status ${response.status} (attendu ${expectedStatus})`,
      }
    }

    const data = await response.json()

    return {
      name,
      status: 'success',
      duration,
      data,
    }
  } catch (error) {
    return {
      name,
      status: 'error',
      duration: Date.now() - start,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runTests() {
  console.log('🧪 Test des Routes API Abrogations Juridiques')
  console.log(`🌐 Base URL: ${BASE_URL}\n`)

  // Test 1: Liste complète (default)
  console.log('1️⃣  GET /api/legal/abrogations (liste complète)')
  const test1 = await test(
    'Liste complète',
    `${BASE_URL}/api/legal/abrogations`
  )
  results.push(test1)
  if (test1.status === 'success') {
    console.log(`   ✅ ${test1.data.total} abrogations (${test1.duration}ms)`)
    console.log(`   📊 Limit: ${test1.data.limit}, Offset: ${test1.data.offset}`)
  } else {
    console.log(`   ❌ ${test1.message}`)
  }

  // Test 2: Filtre par domaine
  console.log('\n2️⃣  GET /api/legal/abrogations?domain=travail')
  const test2 = await test(
    'Filtre domaine travail',
    `${BASE_URL}/api/legal/abrogations?domain=travail`
  )
  results.push(test2)
  if (test2.status === 'success') {
    console.log(`   ✅ ${test2.data.total} abrogations travail (${test2.duration}ms)`)
    if (test2.data.data.length > 0) {
      console.log(
        `   📄 Exemple: ${test2.data.data[0].abrogatedReference} → ${test2.data.data[0].abrogatingReference}`
      )
    }
  } else {
    console.log(`   ❌ ${test2.message}`)
  }

  // Test 3: Pagination
  console.log('\n3️⃣  GET /api/legal/abrogations?limit=5&offset=0')
  const test3 = await test(
    'Pagination (5 résultats)',
    `${BASE_URL}/api/legal/abrogations?limit=5&offset=0`
  )
  results.push(test3)
  if (test3.status === 'success') {
    console.log(`   ✅ ${test3.data.data.length} résultats (${test3.duration}ms)`)
  } else {
    console.log(`   ❌ ${test3.message}`)
  }

  // Test 4: Tri par date
  console.log('\n4️⃣  GET /api/legal/abrogations?sort=abrogation_date_desc&limit=3')
  const test4 = await test(
    'Tri par date décroissant',
    `${BASE_URL}/api/legal/abrogations?sort=abrogation_date_desc&limit=3`
  )
  results.push(test4)
  if (test4.status === 'success') {
    console.log(`   ✅ ${test4.data.data.length} résultats (${test4.duration}ms)`)
    if (test4.data.data.length > 0) {
      console.log(`   📅 Plus récente: ${test4.data.data[0].abrogationDate}`)
    }
  } else {
    console.log(`   ❌ ${test4.message}`)
  }

  // Test 5: Recherche fuzzy "Code pénal"
  console.log('\n5️⃣  GET /api/legal/abrogations/search?q=Code%20pénal&threshold=0.6')
  const test5 = await test(
    'Recherche fuzzy "Code pénal"',
    `${BASE_URL}/api/legal/abrogations/search?q=Code%20pénal&threshold=0.6`
  )
  results.push(test5)
  if (test5.status === 'success') {
    console.log(
      `   ✅ ${test5.data.total} résultats pour "${test5.data.query}" (${test5.duration}ms)`
    )
    if (test5.data.data.length > 0) {
      console.log(
        `   🎯 Meilleur score: ${(test5.data.data[0].similarityScore * 100).toFixed(1)}% - ${test5.data.data[0].abrogatedReference}`
      )
    }
  } else {
    console.log(`   ❌ ${test5.message}`)
  }

  // Test 6: Recherche sans query (erreur attendue)
  console.log('\n6️⃣  GET /api/legal/abrogations/search (sans query - erreur attendue)')
  const test6 = await test(
    'Recherche sans query',
    `${BASE_URL}/api/legal/abrogations/search`,
    400
  )
  results.push(test6)
  if (test6.status === 'success') {
    console.log(`   ✅ Erreur 400 correctement retournée (${test6.duration}ms)`)
  } else {
    console.log(`   ❌ ${test6.message}`)
  }

  // Test 7: Détail d'une abrogation (récupérer ID depuis test 1)
  if (test1.status === 'success' && test1.data.data.length > 0) {
    const sampleId = test1.data.data[0].id
    console.log(`\n7️⃣  GET /api/legal/abrogations/${sampleId}`)
    const test7 = await test(
      'Détail abrogation',
      `${BASE_URL}/api/legal/abrogations/${sampleId}`
    )
    results.push(test7)
    if (test7.status === 'success') {
      console.log(`   ✅ Détail récupéré (${test7.duration}ms)`)
      console.log(
        `   📄 ${test7.data.abrogatedReference} → ${test7.data.abrogatingReference}`
      )
      console.log(`   🏷️  Domaine: ${test7.data.domain || 'N/A'}`)
      console.log(`   🔒 Confiance: ${test7.data.confidence}`)
    } else {
      console.log(`   ❌ ${test7.message}`)
    }
  }

  // Test 8: Détail avec ID invalide (erreur attendue)
  console.log('\n8️⃣  GET /api/legal/abrogations/invalid-id (erreur attendue)')
  const test8 = await test(
    'Détail ID invalide',
    `${BASE_URL}/api/legal/abrogations/invalid-id`,
    400
  )
  results.push(test8)
  if (test8.status === 'success') {
    console.log(`   ✅ Erreur 400 correctement retournée (${test8.duration}ms)`)
  } else {
    console.log(`   ❌ ${test8.message}`)
  }

  // Test 9: Statistiques
  console.log('\n9️⃣  GET /api/legal/abrogations/stats')
  const test9 = await test('Statistiques', `${BASE_URL}/api/legal/abrogations/stats`)
  results.push(test9)
  if (test9.status === 'success') {
    console.log(`   ✅ Statistiques récupérées (${test9.duration}ms)`)
    console.log(`   📊 Total: ${test9.data.total}`)
    console.log(`   ✅ Vérifiées: ${test9.data.verified}`)
    console.log(`   📅 Abrogations récentes: ${test9.data.recentAbrogations.length}`)
    console.log('\n   📈 Par domaine:')
    Object.entries(test9.data.byDomain)
      .sort((a: any, b: any) => b[1] - a[1])
      .forEach(([domain, count]) => {
        console.log(`      - ${domain}: ${count}`)
      })
  } else {
    console.log(`   ❌ ${test9.message}`)
  }

  // Résumé
  console.log('\n' + '='.repeat(60))
  console.log('📊 RÉSUMÉ DES TESTS')
  console.log('='.repeat(60))

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)
  const avgDuration = totalDuration / results.length

  console.log(`✅ Succès: ${successCount}/${results.length}`)
  console.log(`❌ Échecs: ${errorCount}/${results.length}`)
  console.log(`⏱️  Durée totale: ${totalDuration}ms`)
  console.log(`⏱️  Durée moyenne: ${avgDuration.toFixed(0)}ms`)

  if (errorCount > 0) {
    console.log('\n❌ TESTS ÉCHOUÉS:')
    results
      .filter((r) => r.status === 'error')
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.message}`)
      })
  }

  console.log('\n' + '='.repeat(60))

  // Exit code
  process.exit(errorCount > 0 ? 1 : 0)
}

runTests().catch((error) => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
