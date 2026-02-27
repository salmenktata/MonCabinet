#!/usr/bin/env npx tsx
/**
 * Script de migration : Appliquer le pipeline complet codes 9anoun
 * aux legal_documents de type "collection" (cassation.tn + iort.gov.tn)
 *
 * Pipeline appliqué :
 * 1. Re-consolider avec texte complet (consolidateCollection → full text + structure JSON)
 * 2. Approuver le document (is_approved = true)
 * 3. Indexer dans KB via indexLegalDocument() → chunks avec embeddings
 * 4. Supprimer les anciens chunks KB issus des web_pages individuelles
 *
 * Usage:
 *   npx tsx scripts/reindex-legal-docs-collections.ts --all              # Tous (cassation + JORT)
 *   npx tsx scripts/reindex-legal-docs-collections.ts --citation-key=cassation-civil-general
 *   npx tsx scripts/reindex-legal-docs-collections.ts --all --dry-run    # Aperçu
 *   npx tsx scripts/reindex-legal-docs-collections.ts --all --skip-empty # Skip docs sans pages
 */

import { db } from '@/lib/db/postgres'
import { consolidateCollection } from '@/lib/legal-documents/content-consolidation-service'
import { updateConsolidationStatus } from '@/lib/legal-documents/document-service'
import { indexLegalDocument } from '@/lib/web-scraper/web-indexer-service'

// =============================================================================
// CLI PARSING
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2)
  const flags = {
    all: args.includes('--all'),
    citationKey: '',
    dryRun: args.includes('--dry-run'),
    skipEmpty: args.includes('--skip-empty'),
    noCleanup: args.includes('--no-cleanup'),
    noIndex: args.includes('--no-index'),
  }

  const ckIdx = args.findIndex(a => a.startsWith('--citation-key='))
  if (ckIdx !== -1) {
    flags.citationKey = args[ckIdx].split('=')[1]
  }

  if (!flags.all && !flags.citationKey) {
    console.error('Usage:')
    console.error('  npx tsx scripts/reindex-legal-docs-collections.ts --all [--dry-run] [--skip-empty]')
    console.error('  npx tsx scripts/reindex-legal-docs-collections.ts --citation-key=cassation-civil-general')
    process.exit(1)
  }

  return flags
}

// =============================================================================
// DISCOVERY
// =============================================================================

interface CollectionDoc {
  id: string
  citationKey: string
  officialTitleFr: string | null
  officialTitleAr: string | null
  consolidationStatus: string
  isApproved: boolean
  knowledgeBaseId: string | null
  pageCount: number
  oldKbPageCount: number
}

async function discoverCollectionDocs(citationKeyFilter?: string): Promise<CollectionDoc[]> {
  const whereClause = citationKeyFilter
    ? `AND ld.citation_key = $1`
    : `AND (ld.citation_key LIKE 'cassation-%' OR ld.citation_key LIKE 'jort-%')`
  const params = citationKeyFilter ? [citationKeyFilter] : []

  const result = await db.query<any>(
    `SELECT
       ld.id,
       ld.citation_key,
       ld.official_title_fr,
       ld.official_title_ar,
       ld.consolidation_status,
       ld.is_approved,
       ld.knowledge_base_id,
       COUNT(DISTINCT wpd.web_page_id)::int as page_count,
       COUNT(DISTINCT CASE WHEN wp.knowledge_base_id IS NOT NULL
             AND wp.knowledge_base_id != ld.knowledge_base_id
             THEN wp.knowledge_base_id END)::int as old_kb_page_count
     FROM legal_documents ld
     LEFT JOIN web_pages_documents wpd ON wpd.legal_document_id = ld.id
     LEFT JOIN web_pages wp ON wp.id = wpd.web_page_id
     WHERE 1=1 ${whereClause}
     GROUP BY ld.id
     ORDER BY page_count DESC`,
    params
  )

  return result.rows.map(r => ({
    id: r.id,
    citationKey: r.citation_key,
    officialTitleFr: r.official_title_fr,
    officialTitleAr: r.official_title_ar,
    consolidationStatus: r.consolidation_status,
    isApproved: r.is_approved,
    knowledgeBaseId: r.knowledge_base_id,
    pageCount: r.page_count,
    oldKbPageCount: r.old_kb_page_count,
  }))
}

// =============================================================================
// CLEANUP anciens chunks KB page-level
// =============================================================================

async function cleanupOldPageKbEntries(documentId: string, legalKbId: string | null): Promise<{ entriesDeleted: number; chunksDeleted: number }> {
  // Récupérer les anciennes KB entries des web_pages liées (hors KB du doc consolidé)
  const oldKbResult = await db.query<{ kb_id: string }>(
    `SELECT DISTINCT wp.knowledge_base_id as kb_id
     FROM web_pages wp
     JOIN web_pages_documents wpd ON wp.id = wpd.web_page_id
     WHERE wpd.legal_document_id = $1
       AND wp.knowledge_base_id IS NOT NULL
       ${legalKbId ? 'AND wp.knowledge_base_id != $2' : ''}`,
    legalKbId ? [documentId, legalKbId] : [documentId]
  )

  const oldKbIds = oldKbResult.rows.map(r => r.kb_id)
  if (oldKbIds.length === 0) return { entriesDeleted: 0, chunksDeleted: 0 }

  const client = await db.getClient()
  try {
    await client.query('BEGIN')

    const chunksResult = await client.query(
      'DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = ANY($1)',
      [oldKbIds]
    )
    const chunksDeleted = chunksResult.rowCount || 0

    await client.query('DELETE FROM knowledge_base WHERE id = ANY($1)', [oldKbIds])

    await client.query(
      `UPDATE web_pages SET
         knowledge_base_id = NULL,
         is_indexed = false,
         chunks_count = 0,
         last_indexed_at = NULL,
         updated_at = NOW()
       WHERE knowledge_base_id = ANY($1)`,
      [oldKbIds]
    )

    await client.query('COMMIT')
    return { entriesDeleted: oldKbIds.length, chunksDeleted }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// =============================================================================
// PROCESSING
// =============================================================================

interface ProcessResult {
  citationKey: string
  status: 'done' | 'skipped' | 'error'
  pageCount: number
  chunksCreated: number
  chunksDeleted: number
  error?: string
}

async function processDoc(doc: CollectionDoc, dryRun: boolean): Promise<ProcessResult> {
  const result: ProcessResult = {
    citationKey: doc.citationKey,
    status: 'done',
    pageCount: doc.pageCount,
    chunksCreated: 0,
    chunksDeleted: 0,
  }

  try {
    // Étape 1 : Re-consolider (texte complet)
    if (dryRun) {
      console.log(`  [DRY-RUN] consolidateCollection(${doc.id})`)
      console.log(`  [DRY-RUN] indexLegalDocument(${doc.id})`)
      console.log(`  [DRY-RUN] cleanupOldPageKbEntries() → ${doc.oldKbPageCount} entrées KB à supprimer`)
      return result
    }

    await updateConsolidationStatus(doc.id, 'partial')
    console.log(`  🔄 Consolidation (texte complet)...`)
    const consolidation = await consolidateCollection(doc.id)

    if (!consolidation.success) {
      return { ...result, status: 'error', error: consolidation.errors.join('; ') }
    }
    console.log(`  ✅ Consolidé: ${consolidation.totalArticles} articles, ${consolidation.totalWords} mots, ${consolidation.consolidatedTextLength} chars`)

    // Étape 2 : Approuver si pas encore approuvé
    await db.query(
      `UPDATE legal_documents SET is_approved = true, updated_at = NOW() WHERE id = $1`,
      [doc.id]
    )

    // Étape 3 : Indexer dans KB
    console.log(`  🔄 Indexation KB (indexLegalDocument)...`)
    const indexResult = await indexLegalDocument(doc.id)

    if (!indexResult.success) {
      return { ...result, status: 'error', error: indexResult.error || 'Indexation échouée' }
    }
    result.chunksCreated = indexResult.chunksCreated || 0
    console.log(`  ✅ Indexé: ${result.chunksCreated} chunks KB créés (KB: ${indexResult.knowledgeBaseId})`)

    // Étape 4 : Cleanup anciens chunks page-level
    console.log(`  🧹 Cleanup anciens chunks web_pages...`)
    const cleanup = await cleanupOldPageKbEntries(doc.id, indexResult.knowledgeBaseId || null)
    result.chunksDeleted = cleanup.chunksDeleted
    if (cleanup.entriesDeleted > 0) {
      console.log(`  ✅ Supprimé: ${cleanup.entriesDeleted} KB entries, ${cleanup.chunksDeleted} chunks`)
    } else {
      console.log(`  ℹ️  Pas d'anciens chunks à supprimer`)
    }

    return result

  } catch (err: any) {
    return { ...result, status: 'error', error: err.message }
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const flags = parseArgs()

  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║  Reindexation collections → pipeline codes 9anoun           ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log()

  if (flags.dryRun) console.log('🔍 Mode DRY-RUN : aucune modification en base\n')

  const docs = await discoverCollectionDocs(flags.citationKey || undefined)

  const toProcess = flags.skipEmpty
    ? docs.filter(d => d.pageCount > 0)
    : docs

  console.log(`📊 ${docs.length} documents collections trouvés, ${toProcess.length} à traiter\n`)

  // Tableau récapitulatif
  console.log('┌────────────────────────────────────────┬───────┬─────────┬──────────────┐')
  console.log('│ Citation Key                           │ Pages │ Old KB  │ Status       │')
  console.log('├────────────────────────────────────────┼───────┼─────────┼──────────────┤')
  for (const d of docs) {
    const toProc = toProcess.some(t => t.id === d.id)
    const flag = toProc ? '▶' : ' '
    const key = d.citationKey.substring(0, 38).padEnd(38)
    const approved = d.isApproved ? 'approved' : 'pending '
    console.log(`│ ${flag}${key} │ ${String(d.pageCount).padStart(5)} │ ${String(d.oldKbPageCount).padStart(7)} │ ${approved}     │`)
  }
  console.log('└────────────────────────────────────────┴───────┴─────────┴──────────────┘')
  console.log()

  if (toProcess.length === 0) {
    console.log('⚠️  Aucun document à traiter.')
    await db.end()
    return
  }

  const results: ProcessResult[] = []
  for (const doc of toProcess) {
    console.log(`\n📋 ${doc.citationKey}`)
    console.log(`   ${doc.pageCount} pages liées, ${doc.oldKbPageCount} entrées KB existantes`)
    const result = await processDoc(doc, flags.dryRun)
    results.push(result)
    const icon = result.status === 'done' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌'
    console.log(`   ${icon} ${result.status} — ${result.chunksCreated} chunks créés, ${result.chunksDeleted} chunks supprimés`)
    if (result.error) console.log(`   ⚠️  ${result.error}`)
  }

  const done = results.filter(r => r.status === 'done').length
  const errors = results.filter(r => r.status === 'error').length
  const totalChunks = results.reduce((s, r) => s + r.chunksCreated, 0)
  const totalDeleted = results.reduce((s, r) => s + r.chunksDeleted, 0)

  console.log('\n╔══════════════════════════════════════════════════════════════╗')
  console.log(`║  Résultat : ${done} docs traités, ${errors} erreurs`)
  console.log(`║  KB : +${totalChunks} chunks créés, -${totalDeleted} anciens chunks supprimés`)
  console.log('╚══════════════════════════════════════════════════════════════╝')

  await db.end()
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
