#!/usr/bin/env tsx
/**
 * Script pour indexer les 261 pages "9anoun.tn - Codes Consolidés" en PRODUCTION
 * via tunnel SSH (localhost:5433 → DB prod)
 *
 * Prérequis: Tunnel SSH actif sur port 5433
 * (voir scripts/add-iort-source-prod.sh pour ouvrir le tunnel)
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Charger .env.local (contient DATABASE_URL tunnel prod) AVANT les imports
config({ path: resolve(__dirname, '../.env.local') })

// Maintenant importer les modules (ils liront DATABASE_URL depuis process.env)
import { indexSourcePages } from '../lib/web-scraper/web-indexer-service'

const CODES_CONSOLIDES_SOURCE_ID = '26b1b332-58e1-445f-a7fd-324e3814a712'

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Indexation Pages "9anoun.tn - Codes Consolidés" [PRODUCTION]')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log(`📡 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\n`)

  const batchSize = parseInt(process.argv[2] || '50', 10)
  const maxBatches = parseInt(process.argv[3] || '10', 10)

  console.log(`Configuration:`)
  console.log(`  - Batch size: ${batchSize} pages`)
  console.log(`  - Max batches: ${maxBatches}`)
  console.log(`  - Estimation: ~${batchSize * maxBatches} pages max\n`)

  let totalProcessed = 0
  let totalSucceeded = 0
  let totalFailed = 0

  for (let batch = 1; batch <= maxBatches; batch++) {
    console.log(`\n───────────────────────────────────────────────────────────────`)
    console.log(`🔄 Batch ${batch}/${maxBatches} - ${new Date().toLocaleTimeString()}`)
    console.log(`───────────────────────────────────────────────────────────────`)

    const startTime = Date.now()

    try {
      const result = await indexSourcePages(CODES_CONSOLIDES_SOURCE_ID, {
        limit: batchSize,
        reindex: false,
      })

      totalProcessed += result.processed
      totalSucceeded += result.succeeded
      totalFailed += result.failed

      const duration = Date.now() - startTime
      const avgTimePerPage = result.processed > 0 ? Math.round(duration / result.processed) : 0

      console.log(`   ✅ Traités: ${result.processed} | Réussis: ${result.succeeded} | Échoués: ${result.failed}`)
      console.log(`   ⏱️  Durée batch: ${Math.round(duration / 1000)}s (${avgTimePerPage}ms/page)`)

      if (result.processed === 0) {
        console.log('\n✅ Plus de pages à indexer - Terminé!')
        break
      }

      const errors = result.results.filter(r => !r.success)
      if (errors.length > 0 && errors.length <= 3) {
        console.log(`\n   ⚠️  Erreurs:`)
        errors.forEach(e => {
          console.log(`      - Page ${e.pageId.substring(0, 8)}: ${e.error}`)
        })
      } else if (errors.length > 3) {
        console.log(`\n   ⚠️  ${errors.length} erreurs`)
      }

      if (batch < maxBatches && result.processed > 0) {
        console.log(`   💤 Pause 2s...`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error(`   ❌ Erreur batch ${batch}:`, error instanceof Error ? error.message : String(error))
      break
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 RÉSULTATS FINAUX')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`Total traité: ${totalProcessed} pages`)
  console.log(`✅ Succès: ${totalSucceeded}`)
  console.log(`❌ Échecs: ${totalFailed}`)
  console.log(`📈 Taux succès: ${totalProcessed > 0 ? Math.round((totalSucceeded / totalProcessed) * 100) : 0}%\n`)

  process.exit(0)
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
