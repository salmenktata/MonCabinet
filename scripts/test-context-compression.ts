/**
 * Script Test - Compression Contexte (Phase 6.2)
 *
 * Usage: npm run test:context-compression
 */

import { compressContext } from '@/lib/ai/context-compressor-service'

async function main() {
  console.log('🚀 Test Compression Contexte (Phase 6.2)\n')

  const testSources = [
    "Article 242 du Code des Obligations et des Contrats tunisien. [Source-1] La responsabilité civile nécessite trois éléments : une faute, un dommage et un lien de causalité. Le tribunal de cassation a confirmé cette position dans l'arrêt n° 12345/2020.",
    "En matière contractuelle, le contrat est la loi des parties selon l'article 242 COC. [Source-2] Les obligations doivent être exécutées de bonne foi.",
    "Le délai de prescription en matière civile est de 15 ans. [Source-3] Ce délai commence à courir à compter du jour où le titulaire du droit a pu l'exercer.",
  ]

  const query = "Quelle est la prescription en droit civil ?"

  try {
    console.log(`Query: "${query}"`)
    console.log(`Sources: ${testSources.length}`)
    console.log('-'.repeat(70))

    const result = await compressContext(testSources, query, {
      maxTokens: 150,
      preserveCitations: true,
      preserveCoherence: true,
    })

    console.log(`\n✅ Résultats:`)
    console.log(`  Tokens originaux: ${result.originalTokens}`)
    console.log(`  Tokens compressés: ${result.compressedTokens}`)
    console.log(`  Taux compression: ${result.compressionRate.toFixed(1)}%`)
    console.log(`  Phrases conservées: ${result.sentencesKept}/${result.sentencesKept + result.sentencesRemoved}`)
    console.log(`  Citations préservées: ${result.citationsPreserved}`)
    console.log(`  Latence: ${result.processingTime}ms`)

    console.log(`\nContexte compressé:`)
    console.log(`  ${result.compressed.substring(0, 300)}...`)

    // Validations
    if (result.compressionRate < 20) {
      console.warn(`  ⚠️ Compression faible: ${result.compressionRate.toFixed(1)}%`)
    } else {
      console.log(`  ✅ Compression efficace: ${result.compressionRate.toFixed(1)}%`)
    }

    if (result.processingTime > 300) {
      console.warn(`  ⚠️ Latence élevée: ${result.processingTime}ms`)
    } else {
      console.log(`  ✅ Latence OK: ${result.processingTime}ms`)
    }

    console.log('\n✅ SUCCÈS\n')
  } catch (error) {
    console.error('\n💥 ÉCHEC :', error)
    process.exit(1)
  }
}

main()
