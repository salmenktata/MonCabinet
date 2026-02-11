/**
 * Script de test pour le crawl ultra-rapide de 9anoun.tn
 *
 * Tests progressifs :
 * 1. Local : 1 code = ~200 pages (10 min)
 * 2. Staging : 5 codes = ~1000 pages (30 min)
 * 3. Production : 50 codes = ~10K pages (2-4h)
 *
 * Usage :
 *   npm run test:9anoun-crawl -- --mode=discovery  # Test URL discovery uniquement
 *   npm run test:9anoun-crawl -- --mode=single     # Test 1 code (200 pages)
 *   npm run test:9anoun-crawl -- --mode=sample --codes=5  # Test 5 codes (1000 pages)
 *   npm run test:9anoun-crawl -- --mode=full       # Test complet (10K+ pages)
 */

import { discover9anounUrls, injectUrlsToDatabase } from '../lib/web-scraper/url-discovery-service'
import { NINEANOUN_CODE_DOMAINS } from '../lib/web-scraper/9anoun-code-domains'
import { db } from '../lib/db/postgres'

interface TestMode {
  mode: 'discovery' | 'single' | 'sample' | 'full'
  codes?: number  // Nombre de codes pour mode 'sample'
  maxArticles?: number  // Articles max par code (défaut: 500)
}

async function parseArgs(): Promise<TestMode> {
  const args = process.argv.slice(2)
  const modeArg = args.find((arg) => arg.startsWith('--mode='))
  const codesArg = args.find((arg) => arg.startsWith('--codes='))
  const articlesArg = args.find((arg) => arg.startsWith('--articles='))

  const mode = (modeArg?.split('=')[1] || 'discovery') as TestMode['mode']
  const codes = codesArg ? parseInt(codesArg.split('=')[1], 10) : 5
  const maxArticles = articlesArg ? parseInt(articlesArg.split('=')[1], 10) : 500

  return { mode, codes, maxArticles }
}

async function testDiscovery(maxArticles = 500): Promise<void> {
  console.log('\n🧪 TEST 1 : URL Discovery (génération + validation)\n')

  const result = await discover9anounUrls(maxArticles)

  console.log('\n📊 RÉSULTATS :')
  console.log(`  - ${result.totalGenerated} URLs générées`)
  console.log(`  - ${result.totalValid} URLs valides (${((result.totalValid / result.totalGenerated) * 100).toFixed(1)}%)`)
  console.log(`  - ${result.totalInvalid} URLs invalides (404/timeout)`)
  console.log(`  - Durée: ${(result.durationMs / 1000 / 60).toFixed(1)} min`)
  console.log(`  - Débit: ${(result.totalGenerated / result.durationMs * 1000).toFixed(1)} URLs/s`)

  // Vérifier les objectifs
  const expectedTime = 45 * 60 * 1000  // 45 min max attendu
  const success = result.durationMs <= expectedTime && result.totalValid > 9000

  if (success) {
    console.log('\n✅ TEST RÉUSSI : Discovery dans les temps et nombre d\'URLs valides suffisant')
  } else {
    console.log('\n❌ TEST ÉCHOUÉ :')
    if (result.durationMs > expectedTime) {
      console.log(`  - Durée excessive : ${(result.durationMs / 1000 / 60).toFixed(1)}min (max: 45min)`)
    }
    if (result.totalValid < 9000) {
      console.log(`  - Trop peu d'URLs valides : ${result.totalValid} (min: 9000)`)
    }
  }
}

async function testSingleCode(maxArticles = 500): Promise<void> {
  console.log('\n🧪 TEST 2 : Crawl d\'un seul code juridique (~200 pages)\n')

  // Choisir le premier code (code-penal)
  const codeSlug = 'code-penal'
  const codeInfo = NINEANOUN_CODE_DOMAINS[codeSlug]

  console.log(`📖 Code sélectionné : ${codeInfo.nameFr} (${codeSlug})`)

  // Générer URLs pour ce code uniquement
  const urls: string[] = []
  urls.push(`https://9anoun.tn/kb/codes/${codeSlug}`)
  for (let i = 1; i <= maxArticles; i++) {
    urls.push(`https://9anoun.tn/kb/codes/${codeSlug}/${codeSlug}-article-${i}`)
  }

  console.log(`📦 ${urls.length} URLs générées`)

  // Validation HEAD requests
  console.log('🔍 Validation des URLs...')
  const startTime = Date.now()
  const { validateUrls } = await import('../lib/web-scraper/url-discovery-service')
  const result = await validateUrls(urls, 50)
  const durationMin = (Date.now() - startTime) / 1000 / 60

  console.log('\n📊 RÉSULTATS :')
  console.log(`  - ${result.totalValid} URLs valides`)
  console.log(`  - Durée: ${durationMin.toFixed(1)} min`)

  // TODO : Déclencher crawl via API ou directement
  console.log('\n⏭️  PROCHAINE ÉTAPE : Implémenter crawl effectif via API')
}

async function testSampleCodes(numCodes: number, maxArticles = 500): Promise<void> {
  console.log(`\n🧪 TEST 3 : Crawl de ${numCodes} codes juridiques (~${numCodes * 200} pages)\n`)

  // Sélectionner N codes aléatoires
  const allCodes = Object.keys(NINEANOUN_CODE_DOMAINS)
  const selectedCodes = allCodes.slice(0, numCodes)

  console.log(`📖 Codes sélectionnés :`)
  selectedCodes.forEach((slug) => {
    console.log(`  - ${NINEANOUN_CODE_DOMAINS[slug].nameFr} (${slug})`)
  })

  // Générer URLs
  const urls: string[] = []
  for (const slug of selectedCodes) {
    urls.push(`https://9anoun.tn/kb/codes/${slug}`)
    for (let i = 1; i <= maxArticles; i++) {
      urls.push(`https://9anoun.tn/kb/codes/${slug}/${slug}-article-${i}`)
    }
  }

  console.log(`\n📦 ${urls.length} URLs générées`)

  // Validation HEAD requests
  console.log('🔍 Validation des URLs...')
  const startTime = Date.now()
  const { validateUrls } = await import('../lib/web-scraper/url-discovery-service')
  const result = await validateUrls(urls, 50)
  const durationMin = (Date.now() - startTime) / 1000 / 60

  console.log('\n📊 RÉSULTATS :')
  console.log(`  - ${result.totalValid} URLs valides`)
  console.log(`  - Durée: ${durationMin.toFixed(1)} min`)
  console.log(`  - Débit: ${(urls.length / (Date.now() - startTime) * 1000).toFixed(1)} URLs/s`)

  // Vérifier les objectifs (30 min max pour 5 codes)
  const expectedTime = 30 * 60 * 1000
  const success = (Date.now() - startTime) <= expectedTime && result.totalValid > (numCodes * 150)

  if (success) {
    console.log('\n✅ TEST RÉUSSI : Discovery dans les temps')
  } else {
    console.log('\n❌ TEST ÉCHOUÉ : Durée ou nombre d\'URLs insuffisant')
  }
}

async function testFullCrawl(maxArticles = 500): Promise<void> {
  console.log('\n🧪 TEST 4 : Crawl complet 9anoun.tn (~10K+ pages)\n')

  // Utiliser discover9anounUrls complet
  const result = await discover9anounUrls(maxArticles)

  console.log('\n📊 RÉSULTATS DISCOVERY :')
  console.log(`  - ${result.totalValid} URLs valides`)
  console.log(`  - Durée discovery: ${(result.durationMs / 1000 / 60).toFixed(1)} min`)

  // Récupérer web_source_id pour 9anoun.tn
  const sourceResult = await db.query(`
    SELECT id, name, base_url
    FROM web_sources
    WHERE base_url LIKE '%9anoun.tn%'
    LIMIT 1
  `)

  if (sourceResult.rows.length === 0) {
    console.log('\n❌ ERREUR : Source web 9anoun.tn non trouvée en DB')
    console.log('   Créez d\'abord une source via l\'interface Super Admin')
    return
  }

  const webSourceId = sourceResult.rows[0].id
  console.log(`\n📥 Injection des URLs dans la base de données (source: ${sourceResult.rows[0].name})...`)

  // Injecter les URLs en DB
  const insertedCount = await injectUrlsToDatabase(webSourceId, result.validUrls)

  console.log(`✅ ${insertedCount} URLs injectées`)

  console.log('\n⏭️  PROCHAINE ÉTAPE :')
  console.log('   1. Configurer les variables d\'environnement (CRAWLER_CONCURRENCY_STATIC=40, etc.)')
  console.log('   2. Lancer le crawl via API : POST /api/admin/web-sources/{id}/crawl')
  console.log('   3. Monitorer via Dashboard : /super-admin/web-sources/{id}')
}

async function main() {
  const { mode, codes, maxArticles } = await parseArgs()

  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║   🚀 TEST CRAWL ULTRA-RAPIDE 9ANOUN.TN                        ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  try {
    switch (mode) {
      case 'discovery':
        await testDiscovery(maxArticles)
        break

      case 'single':
        await testSingleCode(maxArticles)
        break

      case 'sample':
        await testSampleCodes(codes!, maxArticles)
        break

      case 'full':
        await testFullCrawl(maxArticles)
        break

      default:
        console.log('❌ Mode inconnu. Utilisez : discovery | single | sample | full')
        process.exit(1)
    }

    console.log('\n✅ Test terminé avec succès')
    process.exit(0)
  } catch (error) {
    console.error('\n❌ ERREUR lors du test :', error)
    process.exit(1)
  }
}

main()
