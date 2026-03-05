#!/usr/bin/env tsx
/**
 * Script pour indexer les pages de مجلة الديوانة
 * Source: المجلات القانونية سارية المفعول
 */

import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'

const IORT_CODES_SOURCE_ID = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Indexation مجلة الديوانة')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const batchSize = parseInt(process.argv[2] || '20', 10)
  const maxBatches = parseInt(process.argv[3] || '20', 10)

  let totalProcessed = 0
  let totalSucceeded = 0
  let totalFailed = 0

  for (let batch = 1; batch <= maxBatches; batch++) {
    console.log(`\nBatch ${batch}/${maxBatches} - ${new Date().toLocaleTimeString()}`)
    const startTime = Date.now()

    try {
      const result = await indexSourcePages(IORT_CODES_SOURCE_ID, {
        limit: batchSize,
        reindex: false,
      })

      totalProcessed += result.processed
      totalSucceeded += result.succeeded
      totalFailed += result.failed

      const duration = Date.now() - startTime
      console.log(`  Traités: ${result.processed} | OK: ${result.succeeded} | KO: ${result.failed} | ${Math.round(duration/1000)}s`)

      if (result.processed === 0) {
        console.log('\nPlus de pages à indexer — terminé!')
        break
      }

      const errors = result.results?.filter((r: any) => !r.success) ?? []
      errors.slice(0, 3).forEach((e: any) => console.log('  ERR:', e.url, '-', e.error))

    } catch (err) {
      console.error('Erreur batch:', err)
      break
    }
  }

  console.log(`\n=== Résultat final ===`)
  console.log(`Total traités : ${totalProcessed}`)
  console.log(`Succès        : ${totalSucceeded}`)
  console.log(`Échecs        : ${totalFailed}`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
