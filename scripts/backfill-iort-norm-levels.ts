/**
 * Script de backfill : Ajouter norm_level aux documents IORT existants
 *
 * Contexte : Les 483 PDFs IORT indexés avant la migration du 01/03/2026 n'ont
 * pas de norm_level dans leurs métadonnées. Sans ce champ, les boosts hiérarchiques
 * (1.04-1.35×) ne s'appliquent pas → pénalise les textes officiels dans le RAG.
 *
 * Ce script :
 * 1. Identifie les KB docs IORT sans norm_level (via structured_data.textType)
 * 2. Mappe textType → NormLevel (IORT_TEXTTYPE_TO_NORM_LEVEL)
 * 3. Met à jour knowledge_base.metadata + knowledge_base_chunks.metadata
 *
 * Usage :
 *   npx tsx scripts/backfill-iort-norm-levels.ts [--dry-run]
 *   # Prod : DATABASE_URL=postgres://moncabinet:...@127.0.0.1:5434/qadhya npx tsx scripts/backfill-iort-norm-levels.ts
 */

import { Pool } from 'pg'

const IORT_TEXTTYPE_TO_NORM_LEVEL: Record<string, string> = {
  'قانون أساسي': 'loi_organique',
  'قانون': 'loi_ordinaire',
  'مجلة': 'loi_ordinaire',
  'مرسوم': 'marsoum',
  'أمر': 'ordre_reglementaire',
  'قرار': 'arrete_ministeriel',
  'رإي': 'arrete_ministeriel',
}

const isDryRun = process.argv.includes('--dry-run')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  console.log(`[Backfill IORT norm_level] Démarrage (${isDryRun ? 'DRY RUN' : 'PRODUCTION'})`)

  // Récupérer les docs IORT via la jointure web_pages → web_sources
  const result = await pool.query(`
    SELECT
      kb.id as kb_id,
      kb.metadata as kb_metadata,
      wp.structured_data,
      ws.base_url
    FROM knowledge_base kb
    JOIN web_pages wp ON wp.knowledge_base_id = kb.id
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE ws.base_url LIKE '%iort.gov.tn%'
      AND (kb.metadata->>'normLevel' IS NULL AND kb.metadata->>'norm_level' IS NULL)
    ORDER BY kb.id
  `)

  console.log(`[Backfill] ${result.rows.length} documents IORT sans norm_level`)

  let updated = 0
  let skipped = 0

  for (const row of result.rows) {
    const textType = row.structured_data?.textType as string | undefined
    if (!textType) {
      console.log(`  [SKIP] KB ${row.kb_id} — structured_data.textType absent`)
      skipped++
      continue
    }

    const normLevel = IORT_TEXTTYPE_TO_NORM_LEVEL[textType]
    if (!normLevel) {
      console.log(`  [SKIP] KB ${row.kb_id} — textType inconnu: "${textType}"`)
      skipped++
      continue
    }

    console.log(`  [UPDATE] KB ${row.kb_id} — textType="${textType}" → norm_level="${normLevel}"`)

    if (!isDryRun) {
      // Mettre à jour knowledge_base.metadata
      await pool.query(
        `UPDATE knowledge_base
         SET metadata = jsonb_set(metadata, '{normLevel}', $1::jsonb, true),
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(normLevel), row.kb_id]
      )

      // Propager aux chunks
      await pool.query(
        `UPDATE knowledge_base_chunks
         SET metadata = jsonb_set(metadata, '{normLevel}', $1::jsonb, true)
         WHERE knowledge_base_id = $2`,
        [JSON.stringify(normLevel), row.kb_id]
      )
    }

    updated++
  }

  console.log(`\n[Backfill IORT] Terminé :`)
  console.log(`  Updated : ${updated}`)
  console.log(`  Skipped : ${skipped}`)
  if (isDryRun) console.log(`  Mode DRY RUN — aucune modification effectuée`)

  await pool.end()
}

main().catch((err) => {
  console.error('[Backfill IORT] Erreur fatale:', err)
  process.exit(1)
})
