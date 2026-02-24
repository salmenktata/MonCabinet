#!/usr/bin/env tsx
/**
 * Script: Indexation des PDFs dans MinIO pour une source web donnée
 *
 * Usage:
 *   npx tsx scripts/index-source-pdfs.ts --source-url jibaya.tn
 *   npx tsx scripts/index-source-pdfs.ts --source-url jibaya.tn --dry-run
 *   npx tsx scripts/index-source-pdfs.ts --source-url jibaya.tn --limit 50
 *   npx tsx scripts/index-source-pdfs.ts --source-url jibaya.tn --force
 *   npx tsx scripts/index-source-pdfs.ts --source-id fe86e910-8ec1-44a2-839b-4d05dd296626
 *
 * Options:
 *   --source-url <pattern>  Filtrer la source par base_url (ILIKE)
 *   --source-id <uuid>      Cibler une source par ID exact
 *   --dry-run               Afficher ce qui serait indexé sans indexer
 *   --limit N               Limiter à N pages (défaut: toutes)
 *   --force                 Ré-indexer même si déjà dans web_files
 *   --all-pdfs              Indexer tous les PDFs d'une page (défaut: premier seulement)
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
const allPdfs = args.includes('--all-pdfs')

const sourceUrlArg = args.find(a => a.startsWith('--source-url'))
const sourceIdArg = args.find(a => a.startsWith('--source-id'))
const limitArg = args.find(a => a.startsWith('--limit'))

const sourceUrl = sourceUrlArg
  ? (sourceUrlArg.includes('=') ? sourceUrlArg.split('=')[1] : args[args.indexOf(sourceUrlArg) + 1])
  : null

const sourceId = sourceIdArg
  ? (sourceIdArg.includes('=') ? sourceIdArg.split('=')[1] : args[args.indexOf(sourceIdArg) + 1])
  : null

const limit = limitArg
  ? parseInt(limitArg.includes('=') ? limitArg.split('=')[1] : args[args.indexOf(limitArg) + 1], 10)
  : Infinity

if (!sourceUrl && !sourceId) {
  console.error('Erreur: --source-url ou --source-id requis')
  console.error('Usage: npx tsx scripts/index-source-pdfs.ts --source-url jibaya.tn')
  process.exit(1)
}

const BATCH_SIZE = 3
const PAUSE_MS = 3000

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[index-source-pdfs] Démarrage indexation PDFs')
  console.log(`[index-source-pdfs] Options: dry-run=${dryRun}, force=${force}, allPdfs=${allPdfs}, limit=${isFinite(limit) ? limit : 'tous'}`)

  // Récupérer la source
  let sourceResult
  if (sourceId) {
    sourceResult = await db.query(
      `SELECT id, name, category FROM web_sources WHERE id = $1`,
      [sourceId]
    )
  } else {
    sourceResult = await db.query(
      `SELECT id, name, category FROM web_sources WHERE base_url ILIKE $1 OR name ILIKE $1 LIMIT 1`,
      [`%${sourceUrl}%`]
    )
  }

  if (sourceResult.rows.length === 0) {
    console.error('[index-source-pdfs] Source introuvable en DB')
    process.exit(1)
  }

  const { id: srcId, name: sourceName, category } = sourceResult.rows[0]
  console.log(`[index-source-pdfs] Source: ${sourceName} (id=${srcId}, category=${category})`)

  // Requête pages avec PDFs dans MinIO
  const pagesQuery = force
    ? `
      SELECT wp.id AS page_id, wp.url, wp.linked_files
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND wp.linked_files IS NOT NULL
        AND wp.linked_files::text != '[]'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
          WHERE (f->>'type') IN ('pdf', 'docx', 'doc', 'txt')
            AND f->>'minioPath' IS NOT NULL
        )
      ORDER BY wp.created_at ASC
    `
    : `
      SELECT wp.id AS page_id, wp.url, wp.linked_files
      FROM web_pages wp
      WHERE wp.web_source_id = $1
        AND wp.linked_files IS NOT NULL
        AND wp.linked_files::text != '[]'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(wp.linked_files) f
          WHERE (f->>'type') IN ('pdf', 'docx', 'doc', 'txt')
            AND f->>'minioPath' IS NOT NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM web_files wf
          WHERE wf.web_page_id = wp.id
            AND wf.is_indexed = true
        )
      ORDER BY wp.created_at ASC
    `

  const pagesResult = await db.query(pagesQuery, [srcId])
  const totalPages = pagesResult.rows.length
  const toProcess = isFinite(limit) ? Math.min(limit, totalPages) : totalPages

  console.log(`[index-source-pdfs] ${totalPages} pages avec PDFs non indexés`)
  console.log(`[index-source-pdfs] Traitement: ${toProcess} pages`)

  if (dryRun) {
    console.log('\n[DRY-RUN] Aperçu des premières pages:')
    for (const row of pagesResult.rows.slice(0, 10)) {
      const files: LinkedFile[] = row.linked_files || []
      const pdfs = files.filter(f => f.type === 'pdf' && f.minioPath)
      const label = row.url.replace('https://jibaya.tn', '').replace('https://iort.gov.tn', '').slice(0, 60)
      console.log(`  - ${label} → ${pdfs.length} PDF(s): ${pdfs.map(f => f.filename).join(', ')}`)
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
      const SUPPORTED_TYPES = ['pdf', 'docx', 'doc', 'txt']
      const pdfs = files.filter(f => SUPPORTED_TYPES.includes((f.type || '').toLowerCase()) && f.minioPath)

      if (pdfs.length === 0) {
        skipped++
        continue
      }

      // Indexer tous les fichiers ou seulement le premier
      const toIndex = allPdfs ? pdfs : [pdfs[0]]

      for (const file of toIndex) {
        const pageLabel = `[${i + 1}/${toProcess}]`
        console.log(`${pageLabel} Indexation: ${file.filename} (page=${row.page_id})`)

        const result = await indexFile(
          { ...file, downloaded: true },
          row.page_id,
          srcId,
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
    }

    // Pause entre batches
    if (i + BATCH_SIZE < rows.length) {
      console.log(`[index-source-pdfs] Pause ${PAUSE_MS}ms... (${indexed} indexés, ${failed} échoués)`)
      await new Promise(r => setTimeout(r, PAUSE_MS))
    }
  }

  // =============================================================================
  // RÉSUMÉ
  // =============================================================================

  console.log('\n=== RÉSUMÉ ===')
  console.log(`Source:   ${sourceName}`)
  console.log(`Indexés:  ${indexed}`)
  console.log(`Échoués:  ${failed}`)
  console.log(`Ignorés:  ${skipped}`)
  console.log(`Chunks:   ${totalChunks}`)

  if (errors.length > 0) {
    console.log(`\nErreurs (${errors.length}):`)
    for (const err of errors.slice(0, 20)) {
      console.log(`  - ${err}`)
    }
    if (errors.length > 20) console.log(`  ... et ${errors.length - 20} autres`)
  }

  await closePool()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('[index-source-pdfs] Erreur fatale:', err)
  process.exit(1)
})
