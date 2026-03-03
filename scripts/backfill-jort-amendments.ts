/**
 * Script de Backfill des Amendements JORT
 *
 * Lance l'extraction d'amendements sur tous les documents IORT indexés
 * qui n'ont pas encore été traités (jort_amendments_extracted_at IS NULL).
 *
 * Usage :
 *   npx tsx scripts/backfill-jort-amendments.ts [--dry-run] [--batch-size=20] [--limit=100]
 *
 * Production (via tunnel SSH sur port 5434) :
 *   DATABASE_URL=postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya \
 *   npx tsx scripts/backfill-jort-amendments.ts --batch-size=20
 *
 * IMPORTANT : Ne pas lancer quand Ollama est saturé (indexation en cours)
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Charger .env.local en priorité
config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

import { db } from '@/lib/db/postgres'
import { getKnowledgeDocument } from '@/lib/ai/knowledge-base-service'
import {
  extractAmendmentsFromJORT,
  isLikelyAmendingDocument,
} from '@/lib/knowledge-base/jort-amendment-extractor'
import { linkAmendmentToKB } from '@/lib/knowledge-base/amendment-linker'

// =============================================================================
// ARGS
// =============================================================================

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const BATCH_SIZE = parseInt(
  args.find((a) => a.startsWith('--batch-size='))?.split('=')[1] ?? '10',
  10
)
const LIMIT = parseInt(
  args.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '0',
  10
) || Infinity

const DELAY_MS = 500 // Délai entre documents (évite saturation Ollama)

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('BACKFILL AMENDEMENTS JORT')
  console.log('='.repeat(60))
  console.log(`Mode    : ${DRY_RUN ? 'DRY-RUN (aucune modification)' : 'PRODUCTION'}`)
  console.log(`Batch   : ${BATCH_SIZE} documents par passe`)
  console.log(`Limite  : ${isFinite(LIMIT) ? LIMIT : 'illimitée'}`)
  console.log()

  // 1. Compter les documents en attente
  const countResult = await db.query(`
    SELECT COUNT(*) AS total
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND is_indexed = true
      AND is_active = true
      AND jort_amendments_extracted_at IS NULL
  `)
  const totalPending = parseInt(countResult.rows[0].total, 10)
  console.log(`Documents IORT en attente : ${totalPending}`)

  if (totalPending === 0) {
    console.log('Aucun document à traiter. Fin.')
    process.exit(0)
  }

  if (DRY_RUN) {
    // Liste les premiers documents à traiter
    const sampleResult = await db.query(
      `SELECT id, title, created_at
       FROM knowledge_base
       WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
         AND is_indexed = true
         AND jort_amendments_extracted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 10`
    )
    console.log('\nPremiers documents à traiter (dry-run) :')
    for (const row of sampleResult.rows) {
      console.log(`  - [${row.id.slice(0, 8)}] ${row.title}`)
    }
    console.log('\nRelancer sans --dry-run pour appliquer.')
    process.exit(0)
  }

  // 2. Traitement par batch
  let processed = 0
  let withAmendments = 0
  let skipped = 0
  let errors = 0
  let offset = 0
  const startTime = Date.now()

  while (processed < LIMIT) {
    const batchLimit = Math.min(BATCH_SIZE, isFinite(LIMIT) ? LIMIT - processed : BATCH_SIZE)

    const batchResult = await db.query(
      `SELECT id, title
       FROM knowledge_base
       WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
         AND is_indexed = true
         AND is_active = true
         AND jort_amendments_extracted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [batchLimit, offset]
    )

    if (batchResult.rows.length === 0) break

    console.log(`\nBatch ${Math.floor(offset / BATCH_SIZE) + 1} : ${batchResult.rows.length} documents`)

    for (const row of batchResult.rows) {
      if (processed >= LIMIT) break

      try {
        process.stdout.write(`  [${(processed + 1).toString().padStart(4)}/${Math.min(totalPending, isFinite(LIMIT) ? LIMIT : totalPending)}] ${row.title?.slice(0, 50) ?? '(sans titre)'} ... `)

        const kbDoc = await getKnowledgeDocument(row.id)
        if (!kbDoc || !kbDoc.isIndexed) {
          console.log('SKIP (pas de document ou non indexé)')
          skipped++
          processed++
          continue
        }

        // Test rapide (évite ~60% des appels LLM)
        if (!isLikelyAmendingDocument(kbDoc.fullText ?? '', kbDoc.title)) {
          await db.query(
            `UPDATE knowledge_base SET jort_amendments_extracted_at = NOW() WHERE id = $1`,
            [row.id]
          )
          console.log('SKIP (non modificatif)')
          skipped++
          processed++
          continue
        }

        // Extraction complète
        const extraction = await extractAmendmentsFromJORT(kbDoc)

        if (extraction.isAmendingDocument && extraction.amendments.length > 0) {
          const linking = await linkAmendmentToKB(extraction)
          const artList = extraction.amendments
            .map((a) => `${a.targetCodeSlug}[${a.affectedArticles.join(',')}]`)
            .join(', ')
          console.log(
            `OK — ${extraction.amendments.length} amendements (${artList}), ` +
            `${linking.relationsCreated} relations`
          )
          withAmendments++
        } else {
          console.log('OK — aucun amendement')
        }

        processed++

        // Délai anti-saturation Ollama
        if (DELAY_MS > 0) await sleep(DELAY_MS)
      } catch (err) {
        console.log(`ERREUR: ${err instanceof Error ? err.message : String(err)}`)
        errors++
        processed++
      }
    }

    // Si moins de documents que le batch, on a fini
    if (batchResult.rows.length < batchLimit) break
    offset += BATCH_SIZE
  }

  // 3. Résumé
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log()
  console.log('='.repeat(60))
  console.log('RÉSUMÉ DU BACKFILL')
  console.log('='.repeat(60))
  console.log(`Traités          : ${processed}`)
  console.log(`Avec amendements : ${withAmendments}`)
  console.log(`Ignorés (rapide) : ${skipped}`)
  console.log(`Erreurs          : ${errors}`)
  console.log(`Durée            : ${durationSec}s`)
  console.log()

  if (errors > 0) {
    console.log(`⚠️  ${errors} erreur(s) — relancer le script pour retraiter`)
  } else {
    console.log('✅ Backfill terminé avec succès')
  }

  process.exit(errors > 0 ? 1 : 0)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch((err) => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
