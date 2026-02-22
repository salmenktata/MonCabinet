#!/usr/bin/env tsx
/**
 * Script: Ré-indexation des PDFs IORT déjà dans MinIO
 *
 * Les 449 PDFs IORT sont stockés dans MinIO (web-files/iort/) mais n'ont jamais
 * été indexés via file-indexer-service. Ce script les indexe en batch.
 *
 * Usage:
 *   npx tsx scripts/index-iort-pdfs.ts
 *   npx tsx scripts/index-iort-pdfs.ts --dry-run
 *   npx tsx scripts/index-iort-pdfs.ts --limit 10
 *   npx tsx scripts/index-iort-pdfs.ts --limit 449 --force
 *
 * Options:
 *   --dry-run    Afficher ce qui serait indexé sans indexer
 *   --limit N    Limiter à N PDFs (défaut: tous)
 *   --force      Ré-indexer même si déjà présent dans web_files
 */

import { db, closePool } from '@/lib/db/postgres'
import { indexFile } from '@/lib/web-scraper/file-indexer-service'
import type { LinkedFile } from '@/lib/web-scraper/types'

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const limitArg = args.find(a => a.startsWith('--limit'))
const limit = limitArg
  ? parseInt(limitArg.includes('=') ? limitArg.split('=')[1] : args[args.indexOf(limitArg) + 1], 10)
  : Infinity

const BATCH_SIZE = 5
const PAUSE_MS = 2000

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[index-iort-pdfs] Démarrage ré-indexation PDFs IORT')
  console.log(`[index-iort-pdfs] Options: dry-run=${dryRun}, force=${force}, limit=${isFinite(limit) ? limit : 'tous'}`)

  // Récupérer l'ID de la source IORT
  const sourceResult = await db.query(
    `SELECT id, name, category FROM web_sources WHERE base_url ILIKE '%iort%' OR name ILIKE '%iort%' LIMIT 1`
  )

  if (sourceResult.rows.length === 0) {
    console.error('[index-iort-pdfs] Source IORT introuvable en DB')
    process.exit(1)
  }

  const { id: sourceId, name: sourceName, category } = sourceResult.rows[0]
  console.log(`[index-iort-pdfs] Source: ${sourceName} (id=${sourceId}, category=${category})`)

  // Récupérer toutes les pages IORT avec linked_files non vide contenant des PDFs
  let query: string
  let queryParams: (string | number)[]

  if (force) {
    // Toutes les pages avec PDF, même déjà indexées
    query = `
      SELECT wp.id AS page_id, wp.linked_files
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND wp.linked_files IS NOT NULL
        AND wp.linked_files::text != '[]'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
          WHERE (f->>'type') = 'pdf'
            AND f->>'minioPath' IS NOT NULL
        )
      ORDER BY wp.created_at ASC
    `
    queryParams = [sourceId]
  } else {
    // Seulement les pages dont le PDF n'est PAS encore dans web_files
    query = `
      SELECT wp.id AS page_id, wp.linked_files
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND wp.linked_files IS NOT NULL
        AND wp.linked_files::text != '[]'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
          WHERE (f->>'type') = 'pdf'
            AND f->>'minioPath' IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM web_files wf
          WHERE wf.web_page_id = wp.id
            AND wf.is_indexed = true
        )
      ORDER BY wp.created_at ASC
    `
    queryParams = [sourceId]
  }

  const pagesResult = await db.query(query, queryParams)
  const totalPages = pagesResult.rows.length
  const toProcess = isFinite(limit) ? Math.min(limit, totalPages) : totalPages

  console.log(`[index-iort-pdfs] ${totalPages} pages avec PDFs non indexés trouvées`)
  console.log(`[index-iort-pdfs] Traitement: ${toProcess} pages`)

  if (dryRun) {
    console.log('\n[DRY-RUN] Aperçu des premières pages:')
    for (const row of pagesResult.rows.slice(0, 10)) {
      const files: LinkedFile[] = row.linked_files || []
      const pdfs = files.filter(f => f.type === 'pdf' && f.minioPath)
      console.log(`  - page_id=${row.page_id} → ${pdfs.length} PDF(s): ${pdfs.map(f => f.filename).join(', ')}`)
    }
    if (toProcess > 10) console.log(`  ... et ${toProcess - 10} autres`)
    console.log('\n[DRY-RUN] Aucune indexation effectuée.')
    await closePool()
    return
  }

  // =============================================================================
  // INDEXATION PAR BATCH
  // =============================================================================

  let indexed = 0
  let failed = 0
  let skipped = 0
  let totalChunks = 0
  const errors: string[] = []

  const rows = pagesResult.rows.slice(0, toProcess)

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    for (const row of batch) {
      const files: LinkedFile[] = row.linked_files || []
      const pdfs = files.filter(f => f.type === 'pdf' && f.minioPath)

      if (pdfs.length === 0) {
        skipped++
        continue
      }

      // Prendre le premier PDF (une page IORT = un PDF)
      const file = pdfs[0]

      console.log(`[${i + 1}/${toProcess}] Indexation: ${file.filename} (page=${row.page_id})`)

      const result = await indexFile(
        {
          ...file,
          downloaded: true,
        },
        row.page_id,
        sourceId,
        sourceName,
        category
      )

      if (result.success) {
        indexed++
        totalChunks += result.chunksCreated
        console.log(`  ✓ ${result.chunksCreated} chunks créés`)
      } else {
        failed++
        const errMsg = `${file.filename}: ${result.error}`
        errors.push(errMsg)
        console.warn(`  ✗ ${result.error}`)
      }
    }

    // Pause entre batches
    if (i + BATCH_SIZE < rows.length) {
      console.log(`[index-iort-pdfs] Pause ${PAUSE_MS}ms...`)
      await new Promise(r => setTimeout(r, PAUSE_MS))
    }
  }

  // =============================================================================
  // RÉSUMÉ
  // =============================================================================

  console.log('\n=== RÉSUMÉ ===')
  console.log(`Indexés:  ${indexed}`)
  console.log(`Échoués:  ${failed}`)
  console.log(`Ignorés:  ${skipped}`)
  console.log(`Chunks:   ${totalChunks}`)

  if (errors.length > 0) {
    console.log('\nErreurs:')
    for (const err of errors) {
      console.log(`  - ${err}`)
    }
  }

  await closePool()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('[index-iort-pdfs] Erreur fatale:', err)
  process.exit(1)
})
