#!/usr/bin/env tsx
/**
 * Script de réindexation Knowledge Base avec OpenAI Embeddings
 *
 * Objectif: Migrer progressivement les embeddings Ollama (1024-dim) vers OpenAI (1536-dim)
 * pour améliorer la qualité de recherche RAG (54-63% → 75-85% similarité)
 *
 * Usage:
 *   npx tsx scripts/reindex-kb-openai.ts --batch-size 50 --categories jurisprudence,codes
 *   npx tsx scripts/reindex-kb-openai.ts --all
 *   npx tsx scripts/reindex-kb-openai.ts --categories legislation --dry-run
 *
 * Options:
 *   --batch-size N     Nombre de chunks à réindexer par batch (défaut: 50)
 *   --categories X,Y   Catégories prioritaires (défaut: jurisprudence,codes,legislation)
 *   --all              Réindexer toutes les catégories
 *   --dry-run          Mode simulation (pas de modification DB)
 *   --force            Forcer réindexation même si embedding_openai existe
 *
 * Coût estimé: ~$0.001/doc → ~$0.30 pour 300 docs legislation
 *
 * Février 2026 - Optimisation RAG Sprint 1
 */

import { pool } from '@/lib/db'
import { generateEmbedding } from '@/lib/ai/embeddings-service'
import { formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'

// =============================================================================
// CONFIGURATION
// =============================================================================

interface ReindexOptions {
  batchSize: number
  categories: string[]
  dryRun: boolean
  force: boolean
  allCategories: boolean
}

// Catégories prioritaires par défaut (impact maximum sur assistant IA)
const DEFAULT_CATEGORIES = ['jurisprudence', 'codes', 'legislation']

// =============================================================================
// PARSING ARGUMENTS
// =============================================================================

function parseArgs(): ReindexOptions {
  const args = process.argv.slice(2)

  const options: ReindexOptions = {
    batchSize: 50,
    categories: DEFAULT_CATEGORIES,
    dryRun: false,
    force: false,
    allCategories: false,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === '--batch-size' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10)
      i++
    } else if (arg === '--categories' && args[i + 1]) {
      options.categories = args[i + 1].split(',').map(c => c.trim())
      i++
    } else if (arg === '--all') {
      options.allCategories = true
    } else if (arg === '--dry-run') {
      options.dryRun = true
    } else if (arg === '--force') {
      options.force = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: npx tsx scripts/reindex-kb-openai.ts [options]

Options:
  --batch-size N       Nombre de chunks par batch (défaut: 50)
  --categories X,Y     Catégories à réindexer (défaut: jurisprudence,codes,legislation)
  --all                Réindexer toutes les catégories
  --dry-run            Mode simulation (pas de modification DB)
  --force              Forcer réindexation même si embedding_openai existe
  --help, -h           Afficher cette aide

Exemples:
  npx tsx scripts/reindex-kb-openai.ts
  npx tsx scripts/reindex-kb-openai.ts --categories legislation --batch-size 20
  npx tsx scripts/reindex-kb-openai.ts --all --dry-run
      `)
      process.exit(0)
    }
  }

  return options
}

// =============================================================================
// RÉINDEXATION
// =============================================================================

async function reindexWithOpenAI(options: ReindexOptions) {
  console.log('🚀 Démarrage réindexation OpenAI embeddings...\n')
  console.log('📋 Configuration:')
  console.log(`   - Batch size: ${options.batchSize}`)
  console.log(`   - Catégories: ${options.allCategories ? 'TOUTES' : options.categories.join(', ')}`)
  console.log(`   - Mode: ${options.dryRun ? 'DRY RUN (simulation)' : 'PRODUCTION'}`)
  console.log(`   - Force: ${options.force ? 'Oui' : 'Non'}`)
  console.log()

  // Construire la clause WHERE
  let whereClause = 'WHERE kb.is_active = true'
  const queryParams: any[] = []

  if (!options.allCategories) {
    whereClause += ` AND kb.category::text = ANY($1)`
    queryParams.push(options.categories)
  }

  if (!options.force) {
    // Ne réindexer que les chunks sans embedding OpenAI
    whereClause += ` AND kbc.embedding_openai IS NULL`
  }

  // Compter chunks à réindexer
  const countQuery = `
    SELECT COUNT(*) as total
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    ${whereClause}
  `
  const countResult = await pool.query(countQuery, queryParams)
  const total = parseInt(countResult.rows[0].total, 10)

  if (total === 0) {
    console.log('✅ Aucun chunk à réindexer ! Tous les embeddings OpenAI sont à jour.')
    return
  }

  console.log(`📊 Total chunks à réindexer: ${total}\n`)

  if (options.dryRun) {
    console.log('🔍 Mode DRY RUN - Affichage des 10 premiers chunks:')
    const sampleQuery = `
      SELECT kbc.id, kb.title, kb.category, LENGTH(kbc.content_chunk) as chunk_length
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      ${whereClause}
      LIMIT 10
    `
    const sampleResult = await pool.query(sampleQuery, queryParams)
    console.table(sampleResult.rows)
    console.log('\n⚠️  Mode simulation actif - aucune modification effectuée.')
    return
  }

  // Confirmation utilisateur
  console.log(`⚠️  Vous allez réindexer ${total} chunks avec OpenAI embeddings.`)
  console.log(`💰 Coût estimé: ~$${(total * 0.001).toFixed(2)} (≈ $0.001/chunk)\n`)

  // Demander confirmation (sauf si force)
  if (!options.force && total > 100) {
    console.log('⏸️  Appuyez sur Ctrl+C pour annuler, ou attendez 5s pour continuer...')
    await new Promise(resolve => setTimeout(resolve, 5000))
  }

  // Réindexation progressive
  let processed = 0
  let succeeded = 0
  let failed = 0
  const startTime = Date.now()

  while (processed < total) {
    // Récupérer batch de chunks
    const fetchQuery = `
      SELECT kbc.id, kbc.content_chunk, kb.title
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      ${whereClause}
      LIMIT $${queryParams.length + 1}
    `
    const chunks = await pool.query(fetchQuery, [...queryParams, options.batchSize])

    if (chunks.rows.length === 0) break

    // Générer embeddings OpenAI en parallèle (pour batch performance)
    const batchStart = Date.now()
    const embeddings = await Promise.allSettled(
      chunks.rows.map(chunk =>
        generateEmbedding(chunk.content_chunk, {
          operationName: 'assistant-ia'  // Utilise config OpenAI
        })
      )
    )
    const batchTime = Date.now() - batchStart

    // Update en batch
    for (let i = 0; i < chunks.rows.length; i++) {
      const chunk = chunks.rows[i]
      const embeddingResult = embeddings[i]

      if (embeddingResult.status === 'fulfilled') {
        try {
          const embeddingStr = formatEmbeddingForPostgres(embeddingResult.value.embedding)

          await pool.query(
            `UPDATE knowledge_base_chunks
             SET embedding_openai = $1::vector
             WHERE id = $2`,
            [embeddingStr, chunk.id]
          )

          succeeded++
        } catch (error) {
          console.error(`❌ Erreur UPDATE chunk ${chunk.id}:`, error)
          failed++
        }
      } else {
        console.error(`❌ Erreur embedding chunk ${chunk.id}:`, embeddingResult.reason)
        failed++
      }
    }

    processed += chunks.rows.length
    const progress = ((processed / total) * 100).toFixed(1)
    const avgTime = batchTime / chunks.rows.length
    const eta = ((total - processed) * avgTime / 1000 / 60).toFixed(1)

    console.log(
      `✅ ${processed}/${total} chunks (${progress}%) | ` +
      `Batch: ${chunks.rows.length} en ${(batchTime / 1000).toFixed(1)}s (${avgTime.toFixed(0)}ms/chunk) | ` +
      `ETA: ${eta} min | ` +
      `Succès: ${succeeded} | Échecs: ${failed}`
    )
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1)
  const cost = (succeeded * 0.001).toFixed(2)

  console.log('\n' + '='.repeat(80))
  console.log('🎉 Réindexation terminée !\n')
  console.log(`📊 Résumé:`)
  console.log(`   - Total traité: ${processed}`)
  console.log(`   - Succès: ${succeeded}`)
  console.log(`   - Échecs: ${failed}`)
  console.log(`   - Temps total: ${totalTime} min`)
  console.log(`   - Coût estimé: $${cost}`)
  console.log()

  // Statistiques migration
  const statsQuery = `SELECT * FROM vw_kb_embedding_migration_stats`
  const stats = await pool.query(statsQuery)

  if (stats.rows.length > 0) {
    const stat = stats.rows[0]
    console.log('📈 Statistiques migration globale:')
    console.log(`   - Total chunks: ${stat.total_chunks}`)
    console.log(`   - Ollama embeddings: ${stat.chunks_ollama}`)
    console.log(`   - OpenAI embeddings: ${stat.chunks_openai}`)
    console.log(`   - Les deux: ${stat.chunks_both}`)
    console.log(`   - Progression OpenAI: ${stat.pct_openai_complete}%`)
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const options = parseArgs()

  try {
    await reindexWithOpenAI(options)
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

// Exécution
main().catch(console.error)
