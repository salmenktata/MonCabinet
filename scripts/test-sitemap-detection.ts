/**
 * Script de test : Détection automatique de sitemap
 */

import { detectAndParseSitemap, detectSiteType } from '../lib/web-scraper/sitemap-auto-detector'

async function testSitemapDetection() {
  console.log('='.repeat(60))
  console.log('TEST: Détection automatique sitemap da5ira.com')
  console.log('='.repeat(60))

  const baseUrl = 'https://www.da5ira.com'

  // Test 1: Détection du type de site
  console.log('\n1️⃣  Détection du type de site...')
  const siteType = await detectSiteType(baseUrl)
  console.log(`   Type détecté: ${siteType.type}`)
  console.log(`   Confiance: ${(siteType.confidence * 100).toFixed(0)}%`)
  console.log(`   Preuves: ${siteType.evidence.join(', ')}`)

  // Test 2: Détection et parsing du sitemap
  console.log('\n2️⃣  Détection du sitemap...')
  const result = await detectAndParseSitemap(baseUrl)

  console.log(`\n📊 RÉSULTATS:`)
  console.log(`   Sitemap trouvé: ${result.hasSitemap ? '✓ OUI' : '✗ NON'}`)
  console.log(`   Sitemaps détectés: ${result.sitemapUrls.length}`)
  if (result.sitemapUrls.length > 0) {
    result.sitemapUrls.forEach((url, i) => {
      console.log(`      ${i + 1}. ${url}`)
    })
  }
  console.log(`   URLs de pages extraites: ${result.totalPages}`)

  if (result.totalPages > 0) {
    console.log(`\n📄 Échantillon des URLs (10 premières):`)
    result.pageUrls.slice(0, 10).forEach((url, i) => {
      console.log(`      ${i + 1}. ${url}`)
    })
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ Test terminé`)
  console.log('='.repeat(60))

  process.exit(0)
}

testSitemapDetection().catch(error => {
  console.error('❌ Erreur:', error)
  process.exit(1)
})
