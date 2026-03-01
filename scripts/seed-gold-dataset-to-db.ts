/**
 * Script de seed : migre data/gold-eval-dataset.json vers la table rag_gold_dataset
 *
 * Usage:
 *   npx tsx scripts/seed-gold-dataset-to-db.ts            # Seed réel
 *   npx tsx scripts/seed-gold-dataset-to-db.ts --dry-run  # Aperçu sans écriture
 */

import fs from 'fs'
import path from 'path'
import { getPool } from '../lib/db/postgres'

interface RawGoldCase {
  id: string
  domain: string
  difficulty: string
  question: string
  intentType?: string
  expectedAnswer?: {
    keyPoints?: string[]
    mandatoryCitations?: string[]
    legalBasis?: string
  }
  expectedArticles?: string[]
  goldChunkIds?: string[]
  goldDocumentIds?: string[]
  minRecallAt5?: number
  evaluationCriteria?: {
    completeness?: number
    accuracy?: number
    citations?: number
    reasoning?: number
  }
  expertValidation?: {
    validatorId?: string
    credentials?: string
    validatedAt?: string
    consensus?: number
  }
  _annotationFix?: string
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run')

  const dataPath = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')
  if (!fs.existsSync(dataPath)) {
    console.error(`Fichier introuvable : ${dataPath}`)
    process.exit(1)
  }

  const raw: RawGoldCase[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  console.log(`Chargement de ${raw.length} questions depuis ${dataPath}`)

  if (isDryRun) {
    console.log('\n[DRY RUN] Aperçu des 3 premières entrées :')
    raw.slice(0, 3).forEach(c => {
      console.log(`  - ${c.id} | ${c.domain} | ${c.difficulty} | ${c.intentType ?? 'factual'}`)
      console.log(`    keyPoints: ${c.expectedAnswer?.keyPoints?.length ?? 0}`)
      console.log(`    goldChunkIds: ${c.goldChunkIds?.length ?? 0}`)
    })
    console.log(`\n[DRY RUN] ${raw.length} questions seraient insérées. Aucune modification en base.`)
    return
  }

  const pool = getPool()
  const client = await pool.connect()

  let inserted = 0
  let updated = 0
  let errors = 0

  for (const c of raw) {
    try {
      const notes = c._annotationFix ?? null

      const result = await client.query(
        `INSERT INTO rag_gold_dataset (
          id, domain, difficulty, question, intent_type,
          key_points, mandatory_citations, expected_articles,
          gold_chunk_ids, gold_document_ids,
          min_recall_at_5, eval_criteria, expert_validation, notes
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10,
          $11, $12, $13, $14
        )
        ON CONFLICT (id) DO UPDATE SET
          domain = EXCLUDED.domain,
          difficulty = EXCLUDED.difficulty,
          question = EXCLUDED.question,
          intent_type = EXCLUDED.intent_type,
          key_points = EXCLUDED.key_points,
          mandatory_citations = EXCLUDED.mandatory_citations,
          expected_articles = EXCLUDED.expected_articles,
          gold_chunk_ids = EXCLUDED.gold_chunk_ids,
          gold_document_ids = EXCLUDED.gold_document_ids,
          min_recall_at_5 = EXCLUDED.min_recall_at_5,
          eval_criteria = EXCLUDED.eval_criteria,
          expert_validation = EXCLUDED.expert_validation,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING (xmax = 0) AS is_insert`,
        [
          c.id,
          c.domain,
          c.difficulty,
          c.question,
          c.intentType ?? 'factual',
          c.expectedAnswer?.keyPoints ?? [],
          c.expectedAnswer?.mandatoryCitations ?? [],
          c.expectedArticles ?? [],
          c.goldChunkIds ?? [],
          c.goldDocumentIds ?? [],
          c.minRecallAt5 ?? null,
          c.evaluationCriteria ? JSON.stringify(c.evaluationCriteria) : null,
          c.expertValidation ? JSON.stringify(c.expertValidation) : null,
          notes,
        ]
      )

      if (result.rows[0]?.is_insert) {
        inserted++
      } else {
        updated++
      }
    } catch (err) {
      console.error(`Erreur sur ${c.id}:`, err)
      errors++
    }
  }

  client.release()

  console.log(`\n✅ Seed terminé :`)
  console.log(`   Insérés  : ${inserted}`)
  console.log(`   Mis à jour : ${updated}`)
  console.log(`   Erreurs  : ${errors}`)
}

main().catch(err => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
