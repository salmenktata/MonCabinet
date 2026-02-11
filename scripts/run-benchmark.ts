/**
 * Script - Exécution Benchmark RAG Juridique (Phase 7.1)
 *
 * Usage: npm run benchmark
 */

import { runBenchmark, BENCHMARK_CASES } from '../tests/rag-legal-benchmark'

// Mock RAG function pour test
async function mockRAGFunction(question: string): Promise<string> {
  // Simulation réponse RAG
  await new Promise(resolve => setTimeout(resolve, 100))

  if (question.includes('prescription')) {
    return 'Le délai de prescription de droit commun est de 15 ans selon l\'Article 388 COC. Ce délai commence à courir du jour où le titulaire du droit a pu l\'exercer.'
  }

  if (question.includes('contrat')) {
    return 'Les conditions de validité d\'un contrat sont : le consentement des parties, la capacité de contracter, un objet certain et une cause licite (Article 2 COC).'
  }

  return 'Réponse juridique générique avec [Source-1] et analyse IRAC.'
}

async function main() {
  console.log('🚀 Benchmark RAG Juridique - Gold Standard\n')
  console.log('='.repeat(70))
  console.log(`Dataset: ${BENCHMARK_CASES.length} cas validés par experts`)
  console.log('Objectif: Score >90%, 0 hallucinations critiques\n')

  try {
    const report = await runBenchmark(mockRAGFunction, BENCHMARK_CASES)

    console.log('\n' + '='.repeat(70))
    console.log('📊 RAPPORT FINAL\n')

    console.log(`Total cas testés: ${report.totalCases}`)
    console.log(`✅ Réussis: ${report.passed} (${((report.passed / report.totalCases) * 100).toFixed(1)}%)`)
    console.log(`❌ Échoués: ${report.failed}`)
    console.log(`\n📈 Score Global: ${report.overallScore.toFixed(1)}/100`)

    console.log('\nScores par difficulté:')
    console.log(`  Easy: ${report.scoreByDifficulty.easy.toFixed(1)}%`)
    console.log(`  Medium: ${report.scoreByDifficulty.medium.toFixed(1)}%`)
    console.log(`  Hard: ${report.scoreByDifficulty.hard.toFixed(1)}%`)
    console.log(`  Expert: ${report.scoreByDifficulty.expert.toFixed(1)}%`)

    console.log('\nScores par domaine:')
    for (const [domain, score] of Object.entries(report.scoreByDomain)) {
      if (score > 0) {
        console.log(`  ${domain}: ${score.toFixed(1)}%`)
      }
    }

    if (report.criticalIssues.length > 0) {
      console.log('\n⚠️ Issues critiques:')
      report.criticalIssues.forEach(issue => console.log(`  - ${issue}`))
    }

    console.log('\n' + '='.repeat(70))

    if (report.overallScore >= 90 && report.criticalIssues.length === 0) {
      console.log('✅ SUCCÈS : Niveau Avocat Professionnel atteint !\n')
    } else {
      console.log('❌ ÉCHEC : Objectifs non atteints, amélioration requise\n')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n💥 Erreur:', error)
    process.exit(1)
  }
}

main()
