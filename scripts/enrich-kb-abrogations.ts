/**
 * Script CLI - Enrichissement batch métadonnées abrogation KB
 *
 * Usage :
 *   npx tsx scripts/enrich-kb-abrogations.ts [--limit 100] [--category codes]
 *
 * Options :
 *   --limit N      : Nombre de documents à traiter (défaut: all)
 *   --category X   : Filtrer par catégorie (optionnel)
 *   --batch-size N : Taille batch (défaut: 50)
 *   --stats        : Afficher uniquement statistiques
 *
 * @module scripts/enrich-kb-abrogations
 */

import { batchDetectAbrogations } from '@/lib/knowledge-base/abrogation-detector'
import { query } from '@/lib/db/postgres'

// =============================================================================
// PARSE ARGUMENTS
// =============================================================================

const args = process.argv.slice(2)
const options = {
  limit: null as number | null,
  category: null as string | null,
  batchSize: 50,
  statsOnly: false,
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10)
    i++
  } else if (args[i] === '--category' && args[i + 1]) {
    options.category = args[i + 1]
    i++
  } else if (args[i] === '--batch-size' && args[i + 1]) {
    options.batchSize = parseInt(args[i + 1], 10)
    i++
  } else if (args[i] === '--stats') {
    options.statsOnly = true
  }
}

// =============================================================================
// AFFICHER STATISTIQUES
// =============================================================================

async function displayStats() {
  console.log('\n📊 STATISTIQUES ENRICHISSEMENT ABROGATIONS\n')

  const result = await query(`
    SELECT
      COUNT(*) as total_documents,
      COUNT(CASE WHEN metadata->'abrogation' IS NOT NULL THEN 1 END) as enriched_documents,
      COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'abrogated' THEN 1 END) as abrogated_count,
      COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'modified' THEN 1 END) as modified_count,
      COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'suspended' THEN 1 END) as suspended_count,
      COUNT(CASE WHEN metadata->'abrogation'->>'status' = 'active' THEN 1 END) as active_count
    FROM knowledge_base
    WHERE is_indexed = true
  `)

  const stats = result.rows[0]
  const totalDocs = parseInt(stats.total_documents, 10)
  const enrichedDocs = parseInt(stats.enriched_documents, 10)
  const progressPct = totalDocs > 0 ? ((enrichedDocs / totalDocs) * 100).toFixed(1) : '0.0'

  console.log(`Documents indexés :       ${totalDocs}`)
  console.log(`Documents enrichis :      ${enrichedDocs} (${progressPct}%)`)
  console.log(`  ├─ Abrogés :            ${stats.abrogated_count}`)
  console.log(`  ├─ Modifiés :           ${stats.modified_count}`)
  console.log(`  ├─ Suspendus :          ${stats.suspended_count}`)
  console.log(`  └─ Actifs :             ${stats.active_count}`)
  console.log('')

  if (enrichedDocs < totalDocs) {
    console.log(`⚠️  ${totalDocs - enrichedDocs} document(s) restant(s) à enrichir`)
  } else {
    console.log('✅ Tous les documents sont enrichis !')
  }

  console.log('')
}

// =============================================================================
// ENRICHISSEMENT BATCH
// =============================================================================

async function enrichBatch() {
  const totalStart = Date.now()

  // Compter documents à traiter
  const countQuery = `
    SELECT COUNT(*) as total
    FROM knowledge_base
    WHERE is_indexed = true
      ${options.category ? 'AND category = $1' : ''}
  `
  const countResult = await query(
    countQuery,
    options.category ? [options.category] : []
  )
  const totalDocuments = parseInt(countResult.rows[0].total, 10)
  const documentsToProcess = options.limit || totalDocuments

  console.log('\n🚀 ENRICHISSEMENT BATCH ABROGATIONS\n')
  console.log(`Documents à traiter :     ${documentsToProcess}`)
  console.log(`Catégorie :               ${options.category || 'Toutes'}`)
  console.log(`Taille batch :            ${options.batchSize}`)
  console.log('')

  const globalStats = {
    processed: 0,
    abrogated: 0,
    modified: 0,
    suspended: 0,
    errors: 0,
  }

  let offset = 0

  while (offset < documentsToProcess) {
    const limit = Math.min(options.batchSize, documentsToProcess - offset)

    console.log(`\n📦 Batch ${Math.floor(offset / options.batchSize) + 1} (documents ${offset + 1}-${offset + limit})...`)

    const batchStart = Date.now()

    try {
      const stats = await batchDetectAbrogations({
        limit,
        offset,
        category: options.category || undefined,
      })

      const batchDuration = Date.now() - batchStart

      globalStats.processed += stats.processed
      globalStats.abrogated += stats.abrogated
      globalStats.modified += stats.modified
      globalStats.suspended += stats.suspended
      globalStats.errors += stats.errors

      console.log(`  ✅ Traités :     ${stats.processed}`)
      console.log(`     Abrogés :     ${stats.abrogated}`)
      console.log(`     Modifiés :    ${stats.modified}`)
      console.log(`     Suspendus :   ${stats.suspended}`)
      console.log(`     Erreurs :     ${stats.errors}`)
      console.log(`  ⏱️  Durée :      ${batchDuration}ms (${(batchDuration / stats.processed).toFixed(0)}ms/doc)`)
    } catch (error) {
      console.error(`  ❌ Erreur batch:`, error)
      globalStats.errors += limit
    }

    offset += limit
  }

  const totalDuration = Date.now() - totalStart

  console.log('\n' + '='.repeat(50))
  console.log('📊 RÉSUMÉ FINAL')
  console.log('='.repeat(50))
  console.log(`Documents traités :       ${globalStats.processed}`)
  console.log(`  ├─ Abrogés :            ${globalStats.abrogated}`)
  console.log(`  ├─ Modifiés :           ${globalStats.modified}`)
  console.log(`  ├─ Suspendus :          ${globalStats.suspended}`)
  console.log(`  └─ Erreurs :            ${globalStats.errors}`)
  console.log(`Durée totale :            ${(totalDuration / 1000).toFixed(1)}s`)
  console.log(`Vitesse moyenne :         ${(totalDuration / globalStats.processed).toFixed(0)}ms/doc`)
  console.log('')

  if (globalStats.errors > 0) {
    console.log(`⚠️  ${globalStats.errors} erreur(s) détectée(s)`)
  } else {
    console.log('✅ Enrichissement terminé avec succès !')
  }

  console.log('')
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  try {
    if (options.statsOnly) {
      await displayStats()
    } else {
      await displayStats()
      await enrichBatch()
      await displayStats()
    }

    process.exit(0)
  } catch (error) {
    console.error('\n❌ Erreur fatale:', error)
    process.exit(1)
  }
}

main()
