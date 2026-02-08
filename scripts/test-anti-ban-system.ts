#!/usr/bin/env tsx

/**
 * Script de test du système anti-bannissement
 * Usage: npx tsx scripts/test-anti-ban-system.ts
 */

import { db } from '@/lib/db/postgres'
import {
  getCrawlerHealthStats,
  getSourceBanStatus,
  canSourceCrawl,
  getAllSourcesHealth,
} from '@/lib/web-scraper/monitoring-service'
import { detectBan, getRandomDelay, selectUserAgent } from '@/lib/web-scraper/anti-ban-utils'
import { calculateBackoffDelay, isRetryableError } from '@/lib/web-scraper/retry-utils'

async function testAntibanSystem() {
  console.log('🧪 Test du système anti-bannissement\n')

  // Test 1: Détection de bannissement
  console.log('📋 Test 1: Détection de bannissement')
  const testCases = [
    {
      html: '<div class="cf-captcha-container">Verify you are human</div>',
      statusCode: 200,
      description: 'Captcha Cloudflare',
    },
    {
      html: '<h1>Access Denied</h1>',
      statusCode: 403,
      description: 'HTTP 403',
    },
    {
      html: '<html><body><h1>Article juridique</h1><p>Contenu...</p></body></html>',
      statusCode: 200,
      description: 'Page normale',
    },
  ]

  for (const testCase of testCases) {
    const result = detectBan(testCase.html, testCase.statusCode)
    console.log(`  ${testCase.description}:`, {
      isBanned: result.isBanned,
      confidence: result.confidence,
      reason: result.reason,
    })
  }

  // Test 2: Randomisation des délais
  console.log('\n📋 Test 2: Randomisation des délais')
  const delays = Array.from({ length: 5 }, () => getRandomDelay(1000, 0.2))
  console.log('  Délais générés (base 1000ms ±20%):', delays)
  const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length
  console.log(`  Moyenne: ${avgDelay.toFixed(0)}ms (attendu: ~1000ms)`)

  // Test 3: Exponential backoff
  console.log('\n📋 Test 3: Exponential backoff')
  for (let attempt = 0; attempt < 4; attempt++) {
    const delay = calculateBackoffDelay(attempt)
    console.log(`  Tentative ${attempt + 1}: ${delay}ms`)
  }

  // Test 4: Détection erreurs retryable
  console.log('\n📋 Test 4: Détection erreurs retryable')
  const errorTests = [
    { statusCode: 429, expected: true, desc: 'HTTP 429' },
    { statusCode: 503, expected: true, desc: 'HTTP 503' },
    { statusCode: 404, expected: false, desc: 'HTTP 404' },
    { statusCode: 200, expected: false, desc: 'HTTP 200' },
  ]

  for (const test of errorTests) {
    const isRetryable = isRetryableError(new Error(), test.statusCode)
    const status = isRetryable === test.expected ? '✅' : '❌'
    console.log(`  ${status} ${test.desc}: ${isRetryable} (attendu: ${test.expected})`)
  }

  // Test 5: Sélection User-Agent
  console.log('\n📋 Test 5: Sélection User-Agent')
  const botUA = selectUserAgent(false)
  const stealthUA = selectUserAgent(true)
  console.log('  Mode bot:', botUA)
  console.log('  Mode stealth:', stealthUA.substring(0, 50) + '...')

  // Test 6: Vérifier sources actives
  console.log('\n📋 Test 6: Vérification sources en base de données')
  const sources = await db.query('SELECT id, name, base_url FROM web_sources WHERE is_active = TRUE LIMIT 5')
  console.log(`  Sources actives trouvées: ${sources.rows.length}`)

  if (sources.rows.length > 0) {
    const firstSource = sources.rows[0]
    console.log(`\n  Test avec source: ${firstSource.name}`)

    // Vérifier statut de bannissement
    const banStatus = await getSourceBanStatus(firstSource.id)
    console.log('    Statut ban:', banStatus || 'Aucun')

    // Vérifier si peut crawler
    const canCrawl = await canSourceCrawl(firstSource.id)
    console.log('    Peut crawler:', canCrawl)

    // Récupérer métriques de santé
    const healthStats = await getCrawlerHealthStats(firstSource.id, 24)
    if (healthStats) {
      console.log('    Métriques 24h:', {
        totalRequests: healthStats.totalRequests,
        successRate: healthStats.successRate,
        errors429: healthStats.errors429,
        banDetections: healthStats.banDetections,
      })
    } else {
      console.log('    Métriques 24h: Aucune donnée')
    }
  }

  // Test 7: Vue d'ensemble santé globale
  console.log('\n📋 Test 7: Santé globale du crawler')
  const allHealth = await getAllSourcesHealth(24)
  console.log(`  Sources avec métriques: ${allHealth.length}`)

  if (allHealth.length > 0) {
    const avgSuccessRate = allHealth.reduce((sum, h) => sum + Number(h.successRate), 0) / allHealth.length
    const totalBanDetections = allHealth.reduce((sum, h) => sum + h.banDetections, 0)
    const totalErrors429 = allHealth.reduce((sum, h) => sum + h.errors429, 0)

    console.log('  Statistiques globales:')
    console.log(`    Taux succès moyen: ${avgSuccessRate.toFixed(2)}%`)
    console.log(`    Total bannissements détectés: ${totalBanDetections}`)
    console.log(`    Total erreurs 429: ${totalErrors429}`)

    // Afficher sources problématiques
    const problematic = allHealth.filter(h => Number(h.successRate) < 90 || h.banDetections > 0)
    if (problematic.length > 0) {
      console.log('\n  ⚠️  Sources problématiques:')
      for (const source of problematic) {
        console.log(`    - ${source.sourceName}: ${source.successRate}% succès, ${source.banDetections} bans`)
      }
    } else {
      console.log('\n  ✅ Toutes les sources sont en bonne santé')
    }
  }

  console.log('\n✅ Tests terminés\n')

  await db.closePool()
}

// Exécuter les tests
testAntibanSystem().catch(error => {
  console.error('❌ Erreur lors des tests:', error)
  process.exit(1)
})
