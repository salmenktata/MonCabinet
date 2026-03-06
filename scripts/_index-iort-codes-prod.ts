/**
 * Indexer les 48 pages IORT codes (مجلة الشغل + autres) maintenant en status 'crawled'
 * Source: المجلات القانونية سارية المفعول (d559807e-ce6a-4e39-acce-c42c1409dc1d)
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })
process.env.DATABASE_URL = 'postgresql://moncabinet:prod_secure_password_2026@localhost:5434/qadhya'

import { indexSourcePages } from '../lib/web-scraper/web-indexer-service'

const IORT_CODES_SOURCE_ID = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔄 Indexation Pages IORT Codes "المجلات القانونية" [PRODUCTION]')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log(`📡 DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}\n`)

  const batchSize = parseInt(process.argv[2] || '20', 10)
  const maxBatches = parseInt(process.argv[3] || '5', 10)

  let totalProcessed = 0
  let totalSucceeded = 0
  let totalFailed = 0

  for (let batch = 1; batch <= maxBatches; batch++) {
    console.log(`\n───────────────────────────────────────────────────────────────`)
    console.log(`🔄 Batch ${batch}/${maxBatches} - ${new Date().toLocaleTimeString()}`)

    try {
      const result = await indexSourcePages(IORT_CODES_SOURCE_ID, {
        limit: batchSize,
        reindex: false,
      })

      totalProcessed += result.processed
      totalSucceeded += result.succeeded
      totalFailed += result.failed

      console.log(`   ✅ Traités: ${result.processed} | Réussis: ${result.succeeded} | Échoués: ${result.failed}`)
      
      if (result.processed === 0) {
        console.log('\n✅ Plus de pages à indexer - Terminé!')
        break
      }
      
      const errors = result.results.filter(r => !r.success)
      errors.slice(0, 3).forEach(e => console.log(`   ⚠️  Page ${e.pageId.substring(0, 8)}: ${e.error}`))
      
      if (batch < maxBatches && result.processed > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    } catch (error) {
      console.error(`❌ Erreur batch ${batch}:`, error instanceof Error ? error.message : String(error))
      break
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊 Total: ${totalProcessed} | ✅ ${totalSucceeded} | ❌ ${totalFailed}`)
  
  process.exit(0)
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1) })
