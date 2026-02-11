/**
 * Script Batch - Calcul PageRank Arrêts Tunisiens (Phase 4.4)
 *
 * Calcule et met à jour les scores d'importance (precedent_value)
 * pour tous les arrêts de jurisprudence tunisienne.
 *
 * Usage:
 *   npm run compute:pagerank
 *   npm run compute:pagerank -- --domain=civil
 *   npm run compute:pagerank -- --min-citations=3
 *
 * Cron hebdomadaire suggéré:
 *   0 3 * * 0 cd /opt/moncabinet && npm run compute:pagerank
 *
 * @module scripts/compute-precedent-scores
 */

import {
  computePrecedentScores,
  getTopPrecedentsByDomain,
  getPageRankStats,
  type PageRankOptions,
} from '../lib/ai/precedent-scoring-service'

// =============================================================================
// ARGUMENTS CLI
// =============================================================================

function parseArgs(): PageRankOptions & { verbose?: boolean } {
  const args = process.argv.slice(2)
  const options: PageRankOptions & { verbose?: boolean } = {}

  for (const arg of args) {
    if (arg.startsWith('--domain=')) {
      options.domain = arg.split('=')[1]
    } else if (arg.startsWith('--min-citations=')) {
      options.minCitations = parseInt(arg.split('=')[1])
    } else if (arg.startsWith('--damping=')) {
      options.dampingFactor = parseFloat(arg.split('=')[1])
    } else if (arg.startsWith('--iterations=')) {
      options.maxIterations = parseInt(arg.split('=')[1])
    } else if (arg === '--no-hierarchy-boost') {
      options.hierarchyBoost = false
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }

  return options
}

function printHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║ Calcul PageRank Arrêts Tunisiens - Phase 4.4                             ║
╚═══════════════════════════════════════════════════════════════════════════╝

Usage:
  npm run compute:pagerank [options]

Options:
  --domain=<code>         Filtrer par domaine juridique (civil, penal, etc.)
  --min-citations=<n>     Min citations pour être inclus (défaut: 0)
  --damping=<f>           Facteur amortissement PageRank (défaut: 0.85)
  --iterations=<n>        Max itérations PageRank (défaut: 20)
  --no-hierarchy-boost    Désactiver boost hiérarchique tribunaux
  --verbose, -v           Mode verbose
  --help, -h              Afficher cette aide

Exemples:
  npm run compute:pagerank
  npm run compute:pagerank -- --domain=civil --min-citations=3
  npm run compute:pagerank -- --damping=0.9 --iterations=30

Cron (hebdomadaire, dimanche 3h):
  0 3 * * 0 cd /opt/moncabinet && npm run compute:pagerank

Notes:
  - Le calcul peut prendre 10-60s selon nombre arrêts
  - Scores sauvegardés dans colonne precedent_value (0-1)
  - Boost hiérarchique: Cassation ×1.3, Appel ×1.1, TPI ×1.0
  `)
}

// =============================================================================
// SCRIPT PRINCIPAL
// =============================================================================

async function main() {
  console.log('\n' + '='.repeat(80))
  console.log('🔢 CALCUL PAGERANK - ARRÊTS TUNISIENS (Phase 4.4)')
  console.log('='.repeat(80) + '\n')

  const startTime = Date.now()

  // Parser arguments
  const options = parseArgs()

  console.log('⚙️  Configuration :')
  console.log(`  - Domaine : ${options.domain || 'Tous'}`)
  console.log(`  - Min citations : ${options.minCitations || 0}`)
  console.log(`  - Damping factor : ${options.dampingFactor || 0.85}`)
  console.log(`  - Max itérations : ${options.maxIterations || 20}`)
  console.log(`  - Boost hiérarchique : ${options.hierarchyBoost ?? true ? 'Oui' : 'Non'}`)
  console.log('')

  // Stats AVANT calcul
  console.log('📊 État AVANT calcul :')
  try {
    const statsBefore = await getPageRankStats()
    console.log(`  - Arrêts avec score : ${statsBefore.totalScored}`)
    console.log(`  - Score moyen : ${statsBefore.avgScore.toFixed(4)}`)
    console.log(`  - Score max : ${statsBefore.maxScore.toFixed(4)}`)
    console.log(`  - Top tribunal : ${statsBefore.topTribunal || 'N/A'}`)
  } catch (error) {
    console.log(`  ⚠️  Impossible de récupérer stats : ${error}`)
  }
  console.log('')

  // Calcul PageRank
  console.log('🚀 Lancement calcul PageRank...\n')

  const result = await computePrecedentScores(options)

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('\n' + '='.repeat(80))

  if (!result.success) {
    console.log('❌ ÉCHEC CALCUL PAGERANK\n')
    console.log('Erreurs :')
    result.errors.forEach(err => console.log(`  - ${err}`))
    console.log('')
    process.exit(1)
  }

  console.log('✅ SUCCÈS CALCUL PAGERANK\n')

  console.log('📈 Résultats :')
  console.log(`  - Total nœuds : ${result.totalNodes}`)
  console.log(`  - Arrêts mis à jour : ${result.updatedNodes}`)
  console.log(`  - Itérations : ${result.iterations}/${options.maxIterations || 20}`)
  console.log(`  - Convergence : ${result.convergenceReached ? 'Oui ✅' : 'Non ⚠️'}`)
  console.log(`  - Durée : ${duration}s`)
  console.log('')

  // Top 10 précédents
  if (result.topPrecedents.length > 0) {
    console.log('🏆 Top 10 Arrêts Influents (PageRank) :\n')

    result.topPrecedents.slice(0, 10).forEach((precedent, i) => {
      console.log(`${i + 1}. ${precedent.title.substring(0, 70)}...`)
      console.log(
        `   Score: ${precedent.pageRank.toFixed(4)} | Citations: ${precedent.citedByCount} | Tribunal: ${precedent.tribunalCode || 'N/A'}`
      )
      console.log('')
    })
  }

  // Stats APRÈS calcul
  console.log('📊 État APRÈS calcul :')
  try {
    const statsAfter = await getPageRankStats()
    console.log(`  - Arrêts avec score : ${statsAfter.totalScored}`)
    console.log(`  - Score moyen : ${statsAfter.avgScore.toFixed(4)}`)
    console.log(`  - Score max : ${statsAfter.maxScore.toFixed(4)}`)
    console.log(`  - Top tribunal : ${statsAfter.topTribunal || 'N/A'}`)
  } catch (error) {
    console.log(`  ⚠️  Impossible de récupérer stats : ${error}`)
  }
  console.log('')

  // Top précédents par domaine (si filtré)
  if (options.domain) {
    console.log(`🔍 Top 5 Arrêts - Domaine "${options.domain}" :\n`)

    try {
      const topByDomain = await getTopPrecedentsByDomain(options.domain, 5)

      topByDomain.forEach((precedent, i) => {
        console.log(`${i + 1}. ${precedent.title}`)
        console.log(
          `   ${precedent.decisionNumber || 'N/A'} | Score: ${precedent.pageRank.toFixed(4)} | ${precedent.citedByCount} citations`
        )
        console.log('')
      })
    } catch (error) {
      console.log(`  ⚠️  Impossible de récupérer top domaine : ${error}`)
    }
  }

  console.log('='.repeat(80))
  console.log(`✅ Calcul PageRank terminé avec succès en ${duration}s`)
  console.log('='.repeat(80) + '\n')

  process.exit(0)
}

// =============================================================================
// GESTION ERREURS
// =============================================================================

main().catch(error => {
  console.error('\n💥 ERREUR FATALE :', error)
  console.error('\nStack trace :')
  console.error(error.stack)
  console.error('')
  process.exit(1)
})

// Gestion signaux système
process.on('SIGINT', () => {
  console.log('\n⚠️  Calcul interrompu par utilisateur (SIGINT)')
  process.exit(130)
})

process.on('SIGTERM', () => {
  console.log('\n⚠️  Calcul interrompu par système (SIGTERM)')
  process.exit(143)
})
