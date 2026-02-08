/**
 * Script de test : Scalabilité indexation 1000+ PDFs
 *
 * Teste les améliorations :
 * - Streaming PDF (empreinte mémoire réduite)
 * - Bulk INSERT chunks (overhead transaction réduit)
 * - Récupération jobs orphelins
 * - Monitoring mémoire + backpressure
 *
 * Usage:
 *   npm run test:scalability
 */

import { db } from '@/lib/db/postgres'
import {
  addToQueue,
  getQueueStats,
  processBatch,
  recoverOrphanedJobs,
  cleanupOldJobs,
} from '@/lib/ai/indexing-queue-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

const TEST_BATCH_SIZE = 10
const TEST_DOCUMENTS_COUNT = 10 // Augmenter pour test stress (100, 500, 1000)

// =============================================================================
// HELPERS
// =============================================================================

function getMemoryUsageMB(): number {
  const usage = process.memoryUsage()
  return usage.heapUsed / 1024 / 1024
}

function formatMemory(mb: number): string {
  return `${mb.toFixed(0)} MB`
}

// =============================================================================
// TESTS
// =============================================================================

async function testBulkInsert() {
  console.log('\n📦 Test 1: Bulk INSERT performance')
  console.log('=' .repeat(60))

  // Récupérer un document existant avec plusieurs chunks
  const doc = await db.query(`
    SELECT kb.id, kb.title, COUNT(c.id) as chunk_count
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks c ON c.knowledge_base_id = kb.id
    WHERE kb.is_indexed = true
    GROUP BY kb.id
    HAVING COUNT(c.id) > 10
    LIMIT 1
  `)

  if (doc.rows.length === 0) {
    console.log('⚠️  Aucun document avec >10 chunks trouvé, skip test')
    return
  }

  const docId = doc.rows[0].id
  const chunkCount = parseInt(doc.rows[0].chunk_count)

  console.log(`Document test: ${doc.rows[0].title} (${chunkCount} chunks)`)

  // Réindexer (force bulk INSERT)
  const memBefore = getMemoryUsageMB()
  const startTime = Date.now()

  await addToQueue('reindex', docId, 10, { test: 'bulk_insert' })
  await processBatch(1)

  const duration = Date.now() - startTime
  const memAfter = getMemoryUsageMB()
  const memDelta = memAfter - memBefore

  console.log(`✅ Réindexation terminée en ${duration}ms`)
  console.log(`📊 Mémoire: ${formatMemory(memBefore)} → ${formatMemory(memAfter)} (Δ ${formatMemory(memDelta)})`)
  console.log(`⚡ Performance: ${(duration / chunkCount).toFixed(1)}ms/chunk`)
}

async function testOrphanRecovery() {
  console.log('\n🔄 Test 2: Récupération jobs orphelins')
  console.log('=' .repeat(60))

  // Créer un job orphelin artificiel
  const doc = await db.query(`
    SELECT id FROM knowledge_base WHERE is_indexed = true LIMIT 1
  `)

  if (doc.rows.length === 0) {
    console.log('⚠️  Aucun document trouvé, skip test')
    return
  }

  const docId = doc.rows[0].id
  const jobId = await addToQueue('reindex', docId, 5, { test: 'orphan_recovery' })

  // Simuler orphelin (processing mais pas terminé depuis 20min)
  await db.query(`
    UPDATE indexing_jobs
    SET status = 'processing',
        started_at = NOW() - INTERVAL '20 minutes'
    WHERE id = $1
  `, [jobId])

  console.log(`Job orphelin créé: ${jobId}`)

  // Tester récupération
  const recovered = await recoverOrphanedJobs()
  console.log(`✅ ${recovered} jobs récupérés`)

  // Vérifier statut
  const status = await db.query(`
    SELECT status, started_at FROM indexing_jobs WHERE id = $1
  `, [jobId])

  if (status.rows[0].status === 'pending' && status.rows[0].started_at === null) {
    console.log('✅ Job correctement réinitialisé à pending')
  } else {
    console.error('❌ Job pas correctement réinitialisé:', status.rows[0])
  }

  // Cleanup
  await db.query(`DELETE FROM indexing_jobs WHERE id = $1`, [jobId])
}

async function testMemoryBackpressure() {
  console.log('\n💾 Test 3: Monitoring mémoire + backpressure')
  console.log('=' .repeat(60))

  const stats = await getQueueStats()
  console.log('Stats queue:')
  console.log(`  - Pending: ${stats.pendingCount}`)
  console.log(`  - Processing: ${stats.processingCount}`)
  console.log(`  - Completed today: ${stats.completedToday}`)
  console.log(`  - Failed today: ${stats.failedToday}`)
  console.log(`  - Avg time: ${stats.avgProcessingTimeMs ? stats.avgProcessingTimeMs.toFixed(0) + 'ms' : 'N/A'}`)

  console.log('\nMémoire actuelle:')
  const mem = process.memoryUsage()
  const v8 = require('v8')
  const heapStats = v8.getHeapStatistics()

  const heapUsedMB = mem.heapUsed / 1024 / 1024
  const heapLimitMB = heapStats.heap_size_limit / 1024 / 1024
  const usagePercent = (heapUsedMB / heapLimitMB) * 100

  console.log(`  - Heap used: ${formatMemory(heapUsedMB)}`)
  console.log(`  - Heap limit: ${formatMemory(heapLimitMB)}`)
  console.log(`  - Usage: ${usagePercent.toFixed(1)}%`)
  console.log(`  - RSS: ${formatMemory(mem.rss / 1024 / 1024)}`)
  console.log(`  - External: ${formatMemory(mem.external / 1024 / 1024)}`)

  const threshold = parseInt(process.env.INDEXING_MEMORY_THRESHOLD_PERCENT || '80')
  if (usagePercent > threshold) {
    console.log(`⚠️  Mémoire au-dessus du seuil (${threshold}%), backpressure activé`)
  } else {
    console.log(`✅ Mémoire OK (seuil: ${threshold}%)`)
  }
}

async function testStressIndexing() {
  console.log(`\n🔥 Test 4: Stress test (${TEST_DOCUMENTS_COUNT} documents)`)
  console.log('=' .repeat(60))

  // Récupérer documents non-indexés ou réindexer existants
  const docs = await db.query(`
    SELECT id, title
    FROM knowledge_base
    WHERE full_text IS NOT NULL
    LIMIT $1
  `, [TEST_DOCUMENTS_COUNT])

  if (docs.rows.length === 0) {
    console.log('⚠️  Aucun document trouvé, skip test')
    return
  }

  console.log(`📚 ${docs.rows.length} documents à indexer`)

  // Ajouter à la queue
  for (const doc of docs.rows) {
    await addToQueue('reindex', doc.id, 5, { test: 'stress' })
  }

  const memStart = getMemoryUsageMB()
  const startTime = Date.now()
  let processed = 0
  let peakMemory = memStart

  // Traiter par batches
  while (processed < docs.rows.length) {
    const batchProcessed = await processBatch(TEST_BATCH_SIZE)
    if (batchProcessed === 0) {
      break // Queue vide ou mémoire insuffisante
    }

    processed += batchProcessed
    const currentMem = getMemoryUsageMB()
    peakMemory = Math.max(peakMemory, currentMem)

    console.log(`  [${processed}/${docs.rows.length}] Mémoire: ${formatMemory(currentMem)}`)

    // Force GC si disponible
    if (global.gc && processed % 5 === 0) {
      global.gc()
    }
  }

  const duration = Date.now() - startTime
  const memEnd = getMemoryUsageMB()

  console.log('\n📊 Résultats stress test:')
  console.log(`  - Documents traités: ${processed}/${docs.rows.length}`)
  console.log(`  - Durée totale: ${(duration / 1000).toFixed(1)}s`)
  console.log(`  - Avg: ${(duration / processed).toFixed(0)}ms/doc`)
  console.log(`  - Mémoire start: ${formatMemory(memStart)}`)
  console.log(`  - Mémoire peak: ${formatMemory(peakMemory)} (+${formatMemory(peakMemory - memStart)})`)
  console.log(`  - Mémoire end: ${formatMemory(memEnd)}`)

  if (peakMemory - memStart < 200) {
    console.log('✅ Empreinte mémoire stable (<200MB delta)')
  } else {
    console.log(`⚠️  Empreinte mémoire élevée (${formatMemory(peakMemory - memStart)} delta)`)
  }

  // Cleanup jobs de test
  await db.query(`
    DELETE FROM indexing_jobs
    WHERE metadata->>'test' IN ('stress', 'bulk_insert', 'orphan_recovery')
  `)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('🚀 Tests Scalabilité Indexation 1000+ PDFs')
  console.log('=' .repeat(60))

  try {
    // Test 1: Bulk INSERT
    await testBulkInsert()

    // Test 2: Orphan recovery
    await testOrphanRecovery()

    // Test 3: Memory monitoring
    await testMemoryBackpressure()

    // Test 4: Stress test
    await testStressIndexing()

    // Cleanup
    console.log('\n🧹 Cleanup jobs anciens...')
    const deleted = await cleanupOldJobs()
    console.log(`✅ ${deleted} jobs nettoyés`)

    console.log('\n✅ Tous les tests terminés!')
  } catch (error) {
    console.error('\n❌ Erreur durant les tests:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

// Exécuter si script appelé directement
if (require.main === module) {
  main()
}

export { main }
