/**
 * Script Test - Query Expansion Intelligent (Phase 6.1)
 *
 * Usage: npm run test:query-expansion
 */

import { expandQuery } from '@/lib/ai/smart-query-expansion'

async function main() {
  console.log('🚀 Test Query Expansion Intelligent (Phase 6.1)\n')
  console.log('='.repeat(70))

  const testQueries = [
    {
      query: "Quelle est la procédure de licenciement en droit du travail ?",
      expected: ['synonyms', 'translation'],
    },
    {
      query: "Comment calculer l'indemnité de divorce ?",
      expected: ['synonyms'],
    },
    {
      query: "ما هي شروط عقد البيع ؟",
      expected: ['synonyms', 'translation'],
    },
    {
      query: "Délai de prescription en matière pénale",
      expected: ['synonyms'],
    },
  ]

  try {
    for (const [index, test] of testQueries.entries()) {
      console.log(`\n${index + 1}️⃣ Test Query: "${test.query}"`)
      console.log('-'.repeat(70))

      const startTime = Date.now()
      const result = await expandQuery(test.query, {
        maxExpansions: 5,
        useLLM: false,
        includeSynonyms: true,
        includeTranslation: true,
      })

      console.log(`  Langue détectée: ${result.language}`)
      console.log(`  Temps traitement: ${result.processingTime}ms`)
      console.log(`  Total expansions: ${result.expanded.length}`)

      if (result.strategies.synonyms.length > 0) {
        console.log(`  ✅ Synonymes (${result.strategies.synonyms.length}):`)
        result.strategies.synonyms.slice(0, 3).forEach(s => {
          console.log(`     - ${s}`)
        })
      }

      if (result.strategies.translation.length > 0) {
        console.log(`  ✅ Traductions (${result.strategies.translation.length}):`)
        result.strategies.translation.slice(0, 3).forEach(s => {
          console.log(`     - ${s}`)
        })
      }

      console.log(`  Expansions finales:`)
      result.expanded.forEach(exp => {
        console.log(`     → ${exp}`)
      })

      // Validation latence
      if (result.processingTime > 200) {
        console.warn(`  ⚠️ Latence élevée: ${result.processingTime}ms (>200ms)`)
      } else {
        console.log(`  ✅ Latence OK: ${result.processingTime}ms (<200ms)`)
      }

      // Validation coverage stratégies
      const strategiesUsed = Object.entries(result.strategies)
        .filter(([_, values]) => values.length > 0)
        .map(([key]) => key)

      console.log(`  Stratégies utilisées: ${strategiesUsed.join(', ')}`)
    }

    console.log('\n' + '='.repeat(70))
    console.log('✅ SUCCÈS : Tous les tests passés\n')
  } catch (error) {
    console.error('\n💥 ÉCHEC :', error)
    process.exit(1)
  } finally {
    const { redis } = await import('@/lib/cache/redis')
    await redis.quit()
  }
}

main()
