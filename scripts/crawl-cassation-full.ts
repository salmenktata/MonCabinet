#!/usr/bin/env npx tsx
/**
 * Crawl complet cassation.tn — 17 thèmes juridiques
 *
 * Usage: npx tsx scripts/crawl-cassation-full.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { getWebSourceByUrl } from '@/lib/web-scraper/source-service'
import { crawlSource } from '@/lib/web-scraper/crawler-service'
import { CASSATION_THEMES } from '@/lib/web-scraper/typo3-csrf-utils'

async function main() {
  const startTime = Date.now()
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  Crawl complet cassation.tn — 17 thèmes juridiques     ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`Démarrage: ${new Date().toISOString()}`)
  console.log(`Thèmes: ${Object.keys(CASSATION_THEMES).join(', ')} (${Object.keys(CASSATION_THEMES).length})`)
  console.log('')

  const source = await getWebSourceByUrl('http://www.cassation.tn')
  if (!source) {
    console.error('Source cassation.tn non trouvée en base')
    process.exit(1)
  }

  console.log(`Source: ${source.name} (${source.id})`)
  console.log(`Config: maxPages=${source.maxPages}, maxDepth=${source.maxDepth}, rateLimit=${source.rateLimitMs}ms`)
  console.log(`FormCrawl: ${JSON.stringify(source.formCrawlConfig)}`)
  console.log(`SeedUrls: ${JSON.stringify(source.seedUrls)}`)
  console.log('')

  const result = await crawlSource(source, {
    maxPages: source.maxPages,
    maxDepth: source.maxDepth,
    incrementalMode: false,
  })

  const durationMin = ((Date.now() - startTime) / 60000).toFixed(1)

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════╗')
  console.log('║  RÉSULTATS DU CRAWL                                    ║')
  console.log('╚══════════════════════════════════════════════════════════╝')
  console.log(`Succès:             ${result.success ? 'OUI' : 'NON'}`)
  console.log(`Durée:              ${durationMin} min`)
  console.log(`Pages traitées:     ${result.pagesProcessed}`)
  console.log(`Pages nouvelles:    ${result.pagesNew}`)
  console.log(`Pages modifiées:    ${result.pagesChanged}`)
  console.log(`Pages en erreur:    ${result.pagesFailed}`)
  console.log(`Fichiers DL:        ${result.filesDownloaded}`)
  console.log(`Erreurs:            ${result.errors.length}`)

  if (result.errors.length > 0) {
    console.log('')
    console.log('── Erreurs (max 20) ──')
    for (const err of result.errors.slice(0, 20)) {
      console.log(`  ${err.url.substring(0, 70)} → ${err.error.substring(0, 80)}`)
    }
    if (result.errors.length > 20) {
      console.log(`  ... et ${result.errors.length - 20} autres`)
    }
  }

  console.log('')
  console.log(`Fin: ${new Date().toISOString()}`)
  process.exit(0)
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
