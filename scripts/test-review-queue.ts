#!/usr/bin/env tsx
/**
 * Script de test de la queue de revue humaine
 * Test les APIs et services de content-review
 */

import { db } from '@/lib/db/postgres'
import {
  getReviewQueue,
  getReviewQueueStats,
  createReviewRequest,
} from '@/lib/web-scraper/human-review-service'

async function main() {
  console.log('🧪 Test de la Queue de Revue Humaine\n')

  try {
    // 1. Vérifier que la table existe
    console.log('1️⃣ Vérification de la table human_review_queue...')
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'human_review_queue'
      ) as exists
    `)
    console.log(`   Table existe: ${tableCheck.rows[0].exists ? '✅' : '❌'}\n`)

    if (!tableCheck.rows[0].exists) {
      console.error('❌ La table human_review_queue n\'existe pas!')
      console.log('💡 Exécutez la migration: db/migrations/20260208200000_intelligent_content.sql')
      process.exit(1)
    }

    // 2. Compter les items existants
    console.log('2️⃣ Comptage des items dans la queue...')
    const countResult = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'assigned') as assigned,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped
      FROM human_review_queue
    `)
    const counts = countResult.rows[0]
    console.log(`   Total: ${counts.total}`)
    console.log(`   En attente: ${counts.pending}`)
    console.log(`   Assignées: ${counts.assigned}`)
    console.log(`   En cours: ${counts.in_progress}`)
    console.log(`   Terminées: ${counts.completed}`)
    console.log(`   Ignorées: ${counts.skipped}\n`)

    // 3. Test getReviewQueueStats()
    console.log('3️⃣ Test getReviewQueueStats()...')
    const stats = await getReviewQueueStats()
    console.log(`   Stats récupérées: ✅`)
    console.log(`   - Pending: ${stats.pendingCount}`)
    console.log(`   - Assigned: ${stats.assignedCount}`)
    console.log(`   - Completed today: ${stats.completedToday}`)
    console.log(`   - Avg decision time: ${stats.avgDecisionTimeMs}ms\n`)

    // 4. Test getReviewQueue()
    console.log('4️⃣ Test getReviewQueue()...')
    const queue = await getReviewQueue({ limit: 5 })
    console.log(`   Items récupérés: ${queue.length}`)
    if (queue.length > 0) {
      console.log(`   Premier item:`)
      console.log(`   - ID: ${queue[0].id}`)
      console.log(`   - Type: ${queue[0].reviewType}`)
      console.log(`   - Titre: ${queue[0].title}`)
      console.log(`   - Priorité: ${queue[0].priority}`)
      console.log(`   - Status: ${queue[0].status}\n`)
    }

    // 5. Test création d'un item de test (optionnel)
    const shouldCreateTest = process.argv.includes('--create-test')
    if (shouldCreateTest) {
      console.log('5️⃣ Création d\'un item de test...')
      const testId = await createReviewRequest({
        reviewType: 'quality_check',
        targetType: 'web_page',
        targetId: 'test-page-001',
        title: 'Test de la queue de revue',
        description: 'Ceci est un test automatique',
        priority: 'low',
        qualityScore: 75,
        context: {
          source: 'test-script',
          timestamp: new Date().toISOString(),
        },
      })
      console.log(`   Item créé avec ID: ${testId} ✅\n`)

      // Vérifier qu'on peut le récupérer
      const newQueue = await getReviewQueue({ limit: 1 })
      console.log(`   Item visible dans la queue: ${newQueue.length > 0 ? '✅' : '❌'}\n`)
    }

    // 6. Vérifier les fonctions SQL
    console.log('6️⃣ Vérification des fonctions SQL...')
    const functionsCheck = await db.query(`
      SELECT
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_review_request') as create_exists,
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'claim_next_review_item') as claim_exists,
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'complete_review') as complete_exists,
        EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_review_queue_stats') as stats_exists
    `)
    const funcs = functionsCheck.rows[0]
    console.log(`   create_review_request: ${funcs.create_exists ? '✅' : '❌'}`)
    console.log(`   claim_next_review_item: ${funcs.claim_exists ? '✅' : '❌'}`)
    console.log(`   complete_review: ${funcs.complete_exists ? '✅' : '❌'}`)
    console.log(`   get_review_queue_stats: ${funcs.stats_exists ? '✅' : '❌'}\n`)

    console.log('✅ Tests terminés avec succès!')
  } catch (error) {
    console.error('❌ Erreur pendant les tests:', error)
    process.exit(1)
  } finally {
    await db.end()
  }
}

main()
