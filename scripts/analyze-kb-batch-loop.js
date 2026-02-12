#!/usr/bin/env node
/**
 * Analyse qualité KB en boucle via API production
 * Version JavaScript (pas besoin de tsx)
 * Usage: node scripts/analyze-kb-batch-loop.js
 */

const API_URL = 'https://qadhya.tn/api/admin/kb/analyze-quality'
const BATCH_SIZE = 20
const PAUSE_BETWEEN_BATCHES = 3000 // 3 secondes
const MAX_RETRIES = 3 // Retry logic intégré
const PAUSE_ON_ERROR = 10000 // 10 secondes

async function getStats() {
  const response = await fetch(API_URL)
  const data = await response.json()
  return data.stats
}

async function analyzeBatchWithRetry() {
  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    try {
      if (retry > 0) {
        console.log(`   🔁 Retry ${retry}/${MAX_RETRIES}...`)
        await sleep(PAUSE_ON_ERROR)
      }

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: BATCH_SIZE, skipAnalyzed: true }),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()

      if (data.success && data.analyzed > 0) {
        return data
      }

      console.log(`   ⚠️  Réponse invalide (retry)`)
    } catch (error) {
      console.log(`   ❌ Erreur: ${error.message} (retry)`)
    }
  }

  throw new Error(`Échec après ${MAX_RETRIES} tentatives`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('═'.repeat(60))
  console.log('  🎯 Analyse Qualité KB Production avec Retry - Qadhya')
  console.log('═'.repeat(60))
  console.log()

  // Stats initiales
  console.log('📊 Statistiques initiales...')
  const initialStats = await getStats()
  console.log(`   Total documents: ${initialStats.totalDocs}`)
  console.log(`   Avec score: ${initialStats.withScore}`)
  console.log(`   Sans score: ${initialStats.withoutScore}`)
  console.log()

  const totalToAnalyze = parseInt(initialStats.withoutScore)
  if (totalToAnalyze === 0) {
    console.log('✅ Tous les documents ont déjà un score de qualité !')
    process.exit(0)
  }

  const estimatedBatches = Math.ceil(totalToAnalyze / BATCH_SIZE)
  console.log(`🚀 Démarrage du traitement...`)
  console.log(`   Batches estimés: ${estimatedBatches}`)
  console.log(`   Documents à analyser: ${totalToAnalyze}`)
  console.log()

  let batchNumber = 0
  let totalAnalyzed = 0
  let totalSucceeded = 0
  let totalFailed = 0
  const startTime = Date.now()

  while (true) {
    batchNumber++
    console.log('─'.repeat(60))
    console.log(`🔄 Batch ${batchNumber} - ${new Date().toLocaleTimeString()}`)
    console.log('─'.repeat(60))

    const batchStart = Date.now()

    try {
      const result = await analyzeBatchWithRetry()

      totalAnalyzed += result.analyzed
      totalSucceeded += result.succeeded
      totalFailed += result.failed

      const avgTime = result.results && result.results.length > 0
        ? Math.round(result.results.reduce((sum, r) => sum + r.processingTimeMs, 0) / result.results.length / 1000)
        : 0

      const batchDuration = Math.round((Date.now() - batchStart) / 1000)

      console.log(`   ✅ Analysés: ${result.analyzed} | Réussis: ${result.succeeded} | Échoués: ${result.failed}`)
      console.log(`   ⏱️  Temps moyen/doc: ${avgTime}s | Batch: ${batchDuration}s`)
      console.log(`   📊 Total cumulé: ${totalSucceeded} réussis sur ${totalAnalyzed} tentés`)

      // Si moins de documents que demandé, on a terminé
      if (result.analyzed < BATCH_SIZE) {
        console.log()
        console.log('✅ Tous les documents disponibles ont été analysés')
        break
      }

      // Pause entre batches
      console.log(`   💤 Pause ${PAUSE_BETWEEN_BATCHES / 1000}s...`)
      await sleep(PAUSE_BETWEEN_BATCHES)

    } catch (error) {
      console.log(`❌ Batch ${batchNumber} échoué après ${MAX_RETRIES} tentatives`)
      console.log(`   Erreur: ${error.message}`)
      console.log(`   💤 Pause longue 30s avant prochain batch...`)
      await sleep(30000)
    }
  }

  const totalDuration = Math.round((Date.now() - startTime) / 1000)
  const totalMinutes = Math.floor(totalDuration / 60)
  const totalSeconds = totalDuration % 60

  console.log()
  console.log('═'.repeat(60))
  console.log('  📊 Résumé Final')
  console.log('═'.repeat(60))
  console.log()
  console.log('Documents:')
  console.log(`  ✅ Analysés: ${totalAnalyzed}`)
  console.log(`  ✅ Réussis: ${totalSucceeded}`)
  console.log(`  ❌ Échoués: ${totalFailed}`)
  if (totalAnalyzed > 0) {
    console.log(`  📈 Taux succès: ${Math.round(totalSucceeded * 100 / totalAnalyzed)}%`)
  }
  console.log()
  console.log('Temps:')
  console.log(`  ⏱️  Durée totale: ${totalMinutes}m ${totalSeconds}s`)
  if (totalSucceeded > 0) {
    const avgPerDoc = Math.round(totalDuration / totalSucceeded)
    console.log(`  ⏱️  Temps moyen/doc: ${avgPerDoc}s`)
  }
  console.log()

  // Stats finales
  console.log('📊 Statistiques finales...')
  const finalStats = await getStats()
  console.log(`   Total: ${finalStats.totalDocs} documents`)
  console.log(`   Avec score: ${finalStats.withScore}`)
  console.log(`   Sans score: ${finalStats.withoutScore}`)
  console.log(`   Score moyen: ${finalStats.avgScore}/100`)
  console.log(`   📈 Couverture: ${finalStats.coverage}%`)
  console.log()
  console.log('═'.repeat(60))
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
