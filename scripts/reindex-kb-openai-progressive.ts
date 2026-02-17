#!/usr/bin/env tsx
/**
 * Réindexation progressive OpenAI basée sur la priorité d'usage
 *
 * Utilise la vue matérialisée vw_kb_docs_usage_priority pour traiter
 * en priorité les documents les plus cités dans les conversations.
 *
 * Usage:
 *   npx tsx scripts/reindex-kb-openai-progressive.ts
 *   npx tsx scripts/reindex-kb-openai-progressive.ts --daily-limit 100
 *   npx tsx scripts/reindex-kb-openai-progressive.ts --dry-run
 *   npx tsx scripts/reindex-kb-openai-progressive.ts --stats
 *
 * Options:
 *   --daily-limit N    Chunks max par exécution (défaut: 50)
 *   --min-priority N   Score priorité minimum (défaut: 0)
 *   --dry-run          Mode simulation
 *   --stats            Afficher uniquement les statistiques
 *
 * Conçu pour être exécuté quotidiennement via cron.
 * Coût estimé: ~$0.05/jour (50 chunks × $0.001/chunk)
 *
 * Sprint 4 - Février 2026
 */

import { pool } from '@/lib/db'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ProgressiveOptions {
  dailyLimit: number
  minPriority: number
  dryRun: boolean
  statsOnly: boolean
}

function parseArgs(): ProgressiveOptions {
  const args = process.argv.slice(2)
  const options: ProgressiveOptions = {
    dailyLimit: 50,
    minPriority: 0,
    dryRun: false,
    statsOnly: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--daily-limit' && args[i + 1]) {
      options.dailyLimit = parseInt(args[i + 1], 10)
      i++
    } else if (arg === '--min-priority' && args[i + 1]) {
      options.minPriority = parseInt(args[i + 1], 10)
      i++
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--stats') {
      options.statsOnly = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx tsx scripts/reindex-kb-openai-progressive.ts [options]

Options:
  --daily-limit N    Chunks max par exécution (défaut: 50)
  --min-priority N   Score priorité minimum (défaut: 0)
  --dry-run          Mode simulation
  --stats            Afficher uniquement les statistiques
  --help, -h         Afficher cette aide

Exemples:
  npx tsx scripts/reindex-kb-openai-progressive.ts
  npx tsx scripts/reindex-kb-openai-progressive.ts --daily-limit 100
  npx tsx scripts/reindex-kb-openai-progressive.ts --stats
      `)
      process.exit(0)
    }
  }

  return options
}

// =============================================================================
// STATISTIQUES
// =============================================================================

async function showStats() {
  console.log('📊 Statistiques Migration OpenAI Embeddings\n')

  // Stats globales migration
  try {
    const migrationStats = await pool.query('SELECT * FROM vw_kb_embedding_migration_stats')
    if (migrationStats.rows.length > 0) {
      const s = migrationStats.rows[0]
      console.log('🔢 Migration Embeddings:')
      console.log(`   Total chunks      : ${s.total_chunks}`)
      console.log(`   Ollama (1024-dim)  : ${s.chunks_ollama}`)
      console.log(`   OpenAI (1536-dim)  : ${s.chunks_openai}`)
      console.log(`   Les deux           : ${s.chunks_both}`)
      console.log(`   Progression        : ${s.pct_openai_complete}%`)
      console.log()
    }
  } catch {
    console.log('⚠️  Vue vw_kb_embedding_migration_stats non disponible\n')
  }

  // Stats priorité
  try {
    const priorityStats = await pool.query('SELECT * FROM vw_kb_migration_priority_summary')
    if (priorityStats.rows.length > 0) {
      const p = priorityStats.rows[0]
      console.log('🎯 Priorisation par Usage:')
      console.log(`   Total docs         : ${p.total_docs}`)
      console.log(`   À migrer           : ${p.docs_needing_migration}`)
      console.log(`   Déjà migrés        : ${p.docs_migrated}`)
      console.log(`   Avec citations     : ${p.docs_with_usage}`)
      console.log(`   Sans citations     : ${p.docs_without_usage}`)
      console.log(`   Score priorité moy : ${p.avg_priority_score}`)
      console.log(`   Top 80% docs       : ${p.top_80_pct_docs}`)
      console.log(`   Chunks à migrer    : ${p.total_chunks_to_migrate}`)
      console.log(`   Coût estimé        : $${p.estimated_cost_usd}`)
      console.log()
    }
  } catch {
    console.log('⚠️  Vue vw_kb_migration_priority_summary non disponible')
    console.log('   Exécutez: psql -f migrations/2026-02-15-add-kb-usage-priority.sql\n')
  }

  // Top 10 documents prioritaires
  try {
    const top10 = await pool.query(`
      SELECT doc_id, title, category, citation_count, priority_score,
             chunks_without_openai, total_chunks
      FROM vw_kb_docs_usage_priority
      WHERE needs_openai_migration = true
      ORDER BY priority_score DESC
      LIMIT 10
    `)
    if (top10.rows.length > 0) {
      console.log('🏆 Top 10 Documents Prioritaires (à migrer):')
      console.table(top10.rows.map(r => ({
        titre: (r.title || '').substring(0, 50),
        catégorie: r.category,
        citations: r.citation_count,
        priorité: r.priority_score,
        chunks_restants: `${r.chunks_without_openai}/${r.total_chunks}`,
      })))
    }
  } catch {
    // Vue non disponible
  }
}

// =============================================================================
// RÉINDEXATION PROGRESSIVE
// =============================================================================

async function reindexProgressive(options: ProgressiveOptions) {
  console.log('🚀 Réindexation Progressive OpenAI (basée sur usage)\n')
  console.log('📋 Configuration:')
  console.log(`   Limite quotidienne : ${options.dailyLimit} chunks`)
  console.log(`   Priorité minimum  : ${options.minPriority}`)
  console.log(`   Mode              : ${options.dryRun ? 'DRY RUN' : 'PRODUCTION'}`)
  console.log()

  // Rafraîchir la vue matérialisée avant de commencer
  console.log('🔄 Rafraîchissement vue priorité...')
  try {
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY vw_kb_docs_usage_priority')
    console.log('   ✅ Vue rafraîchie\n')
  } catch (error) {
    // Si CONCURRENTLY échoue (premier refresh), essayer sans
    try {
      await pool.query('REFRESH MATERIALIZED VIEW vw_kb_docs_usage_priority')
      console.log('   ✅ Vue rafraîchie (non-concurrent)\n')
    } catch {
      console.error('   ❌ Impossible de rafraîchir la vue. Exécutez d\'abord la migration SQL.')
      console.error('   psql -f migrations/2026-02-15-add-kb-usage-priority.sql')
      process.exit(1)
    }
  }

  // Sélectionner les chunks à migrer par ordre de priorité document
  const chunksQuery = `
    SELECT kbc.id AS chunk_id, kbc.content, kb.title, kb.category,
           vp.priority_score, vp.citation_count
    FROM vw_kb_docs_usage_priority vp
    JOIN knowledge_base kb ON vp.doc_id = kb.id
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE vp.needs_openai_migration = true
      AND vp.priority_score >= $1
      AND kbc.embedding_openai IS NULL
    ORDER BY vp.priority_score DESC, kbc.chunk_index ASC
    LIMIT $2
  `

  const chunks = await pool.query(chunksQuery, [options.minPriority, options.dailyLimit])

  if (chunks.rows.length === 0) {
    console.log('✅ Aucun chunk à migrer ! Tous les embeddings OpenAI sont à jour.')
    return
  }

  console.log(`📦 ${chunks.rows.length} chunks sélectionnés par priorité:\n`)

  // Afficher résumé par catégorie
  const byCat: Record<string, number> = {}
  for (const row of chunks.rows) {
    byCat[row.category] = (byCat[row.category] || 0) + 1
  }
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${cat}: ${count} chunks`)
  }
  console.log()

  if (options.dryRun) {
    console.log('🔍 Mode DRY RUN - Aperçu des 10 premiers:')
    console.table(chunks.rows.slice(0, 10).map(r => ({
      titre: (r.title || '').substring(0, 40),
      catégorie: r.category,
      priorité: r.priority_score,
      citations: r.citation_count,
      taille: r.content?.length || 0,
    })))
    console.log('\n⚠️  Simulation - aucune modification effectuée.')
    return
  }

  // Réindexation
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()
  const BATCH_SIZE = 10 // Sous-batch pour embeddings parallèles

  for (let i = 0; i < chunks.rows.length; i += BATCH_SIZE) {
    const batch = chunks.rows.slice(i, i + BATCH_SIZE)
    const batchStart = Date.now()

    // Générer embeddings en parallèle
    const results = await Promise.allSettled(
      batch.map(chunk =>
        generateEmbedding(chunk.content, { operationName: 'indexation' })
      )
    )

    // Sauvegarder en DB
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j]
      const result = results[j]

      if (result.status === 'fulfilled') {
        try {
          const embeddingStr = formatEmbeddingForPostgres(result.value.embedding)
          await pool.query(
            `UPDATE knowledge_base_chunks SET embedding_openai = $1::vector WHERE id = $2`,
            [embeddingStr, chunk.chunk_id]
          )
          succeeded++
        } catch (error) {
          console.error(`   ❌ Erreur UPDATE chunk ${chunk.chunk_id}:`, error)
          failed++
        }
      } else {
        console.error(`   ❌ Erreur embedding chunk ${chunk.chunk_id}:`, result.reason?.message || result.reason)
        failed++
      }
    }

    const batchTime = Date.now() - batchStart
    const processed = Math.min(i + BATCH_SIZE, chunks.rows.length)
    const progress = ((processed / chunks.rows.length) * 100).toFixed(0)
    console.log(
      `   ✅ ${processed}/${chunks.rows.length} (${progress}%) | ` +
      `Batch: ${batch.length} en ${(batchTime / 1000).toFixed(1)}s | ` +
      `Succès: ${succeeded} | Échecs: ${failed}`
    )

    // Pause entre batches pour ne pas surcharger l'API
    if (i + BATCH_SIZE < chunks.rows.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)
  const cost = (succeeded * 0.001).toFixed(3)

  console.log('\n' + '='.repeat(60))
  console.log('📊 Résumé Réindexation Progressive:\n')
  console.log(`   Traités   : ${chunks.rows.length}`)
  console.log(`   Succès    : ${succeeded}`)
  console.log(`   Échecs    : ${failed}`)
  console.log(`   Temps     : ${totalTime}s`)
  console.log(`   Coût est. : $${cost}`)
  console.log()

  // Stats migration mises à jour
  try {
    const stats = await pool.query('SELECT * FROM vw_kb_embedding_migration_stats')
    if (stats.rows.length > 0) {
      const s = stats.rows[0]
      console.log(`📈 Progression migration: ${s.pct_openai_complete}% (${s.chunks_openai}/${s.total_chunks} chunks)`)
    }
  } catch {
    // Ignorer si vue non disponible
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const options = parseArgs()

  try {
    if (options.statsOnly) {
      await showStats()
    } else {
      await reindexProgressive(options)
    }
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch(console.error)
