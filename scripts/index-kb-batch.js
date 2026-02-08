#!/usr/bin/env node
/**
 * Script simple pour indexer un petit batch de documents knowledge_base
 * Usage: node scripts/index-kb-batch.js [batch_size]
 */

const batchSize = parseInt(process.argv[2] || '3', 10)

async function main() {
  try {
    // Import dynamique après que l'environnement soit chargé
    const { indexPendingDocuments } = await import('../lib/ai/knowledge-base-service.js')
    const { closePool } = await import('../lib/db/postgres.js')

    console.log(`[KB-Indexing] Indexation de ${batchSize} documents...`)

    const result = await indexPendingDocuments(batchSize)

    console.log(`[KB-Indexing] ✓ Indexés: ${result.succeeded}, ✗ Échoués: ${result.failed}`)

    if (result.failed > 0) {
      console.error(`[KB-Indexing] Erreurs:`, result.results.filter(r => !r.success).map(r => r.error))
    }

    await closePool()
    process.exit(result.failed > 0 ? 1 : 0)
  } catch (error) {
    console.error('[KB-Indexing] Erreur fatale:', error.message)
    process.exit(1)
  }
}

main()
