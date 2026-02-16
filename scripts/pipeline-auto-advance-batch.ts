/**
 * Script batch : auto-advance des documents KB dans le pipeline
 *
 * Usage:
 *   npx tsx scripts/pipeline-auto-advance-batch.ts [--dry-run] [--limit 500] [--stage crawled]
 *
 * Options:
 *   --dry-run   Ne fait que compter les docs éligibles, sans avancer
 *   --limit N   Nombre max de docs à traiter (défaut: 500)
 *   --stage S   Filtrer par stage (peut être répété)
 *
 * Exemples:
 *   npx tsx scripts/pipeline-auto-advance-batch.ts --dry-run
 *   npx tsx scripts/pipeline-auto-advance-batch.ts --limit 100 --stage crawled
 *   npx tsx scripts/pipeline-auto-advance-batch.ts --limit 2000
 */

import { db } from '@/lib/db/postgres'
import { autoAdvanceIfEligible } from '@/lib/pipeline/document-pipeline-service'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) || 500 : 500

// Collecter les stages (peut être répété)
const stages: string[] = []
args.forEach((arg, i) => {
  if (arg === '--stage' && args[i + 1]) stages.push(args[i + 1])
})
if (stages.length === 0) {
  stages.push('crawled', 'content_reviewed', 'classified', 'indexed', 'quality_analyzed')
}

async function main() {
  console.log('=== Pipeline Auto-Advance Batch ===')
  console.log(`Mode: ${dryRun ? 'DRY RUN (simulation)' : 'LIVE (modifications réelles)'}`)
  console.log(`Stages: ${stages.join(', ')}`)
  console.log(`Limit: ${limit}`)
  console.log('')

  // Compter par stage
  const countResult = await db.query(
    `SELECT pipeline_stage, COUNT(*) as cnt
    FROM knowledge_base
    WHERE pipeline_stage = ANY($1::text[])
      AND is_active = true
    GROUP BY pipeline_stage
    ORDER BY pipeline_stage`,
    [stages]
  )

  console.log('Documents par stage:')
  let totalCandidates = 0
  for (const row of countResult.rows) {
    console.log(`  ${row.pipeline_stage}: ${row.cnt} docs`)
    totalCandidates += parseInt(row.cnt)
  }
  console.log(`  Total: ${totalCandidates} docs`)
  console.log('')

  if (dryRun) {
    console.log('=== DRY RUN - Aucune modification ===')
    // Vérifier combien sont éligibles à l'auto-advance
    const eligibleResult = await db.query(
      `SELECT kb.id, kb.pipeline_stage, kb.is_indexed, kb.quality_score, kb.category,
        LENGTH(kb.full_text) as text_length,
        (SELECT COUNT(*) FROM knowledge_base_chunks c WHERE c.knowledge_base_id = kb.id) as chunks_count
      FROM knowledge_base kb
      WHERE kb.pipeline_stage = ANY($1::text[])
        AND kb.is_active = true
      LIMIT $2`,
      [stages, limit]
    )

    let canAdvanceCount = 0
    const stageStats: Record<string, { eligible: number; blocked: number; reasons: Record<string, number> }> = {}

    for (const doc of eligibleResult.rows) {
      const stage = doc.pipeline_stage
      if (!stageStats[stage]) stageStats[stage] = { eligible: 0, blocked: 0, reasons: {} }

      // Vérifications simples
      const textLength = parseInt(doc.text_length || '0')
      const chunks = parseInt(doc.chunks_count || '0')
      let canAdvance = true
      let reason = ''

      if (stage === 'crawled' && textLength < 100) {
        canAdvance = false
        reason = 'texte < 100 chars'
      } else if (stage === 'classified' && !doc.category) {
        canAdvance = false
        reason = 'pas de catégorie'
      } else if (stage === 'indexed' && chunks === 0) {
        canAdvance = false
        reason = '0 chunks'
      } else if (stage === 'quality_analyzed' && doc.quality_score !== null && doc.quality_score < 75) {
        canAdvance = false
        reason = `score ${doc.quality_score} < 75`
      }

      if (canAdvance) {
        stageStats[stage].eligible++
        canAdvanceCount++
      } else {
        stageStats[stage].blocked++
        stageStats[stage].reasons[reason] = (stageStats[stage].reasons[reason] || 0) + 1
      }
    }

    console.log('\nEstimation éligibilité:')
    for (const [stage, stats] of Object.entries(stageStats)) {
      console.log(`  ${stage}: ${stats.eligible} éligibles, ${stats.blocked} bloqués`)
      for (const [reason, count] of Object.entries(stats.reasons)) {
        console.log(`    - ${reason}: ${count}`)
      }
    }
    console.log(`\nTotal estimé éligible: ${canAdvanceCount} / ${eligibleResult.rows.length}`)

    await db.end()
    process.exit(0)
  }

  // MODE LIVE
  console.log('Récupération des documents...')
  const docsResult = await db.query(
    `SELECT id, pipeline_stage, title
    FROM knowledge_base
    WHERE pipeline_stage = ANY($1::text[])
      AND is_active = true
    ORDER BY pipeline_stage_updated_at ASC
    LIMIT $2`,
    [stages, limit]
  )

  console.log(`${docsResult.rows.length} documents à traiter\n`)

  const stats = {
    processed: 0,
    advanced: 0,
    unchanged: 0,
    errors: 0,
    byStage: {} as Record<string, number>,
  }

  const startTime = Date.now()
  let lastProgressLog = 0

  for (const doc of docsResult.rows) {
    stats.processed++
    try {
      const result = await autoAdvanceIfEligible(doc.id, 'system-batch')
      if (result && result.advanced.length > 0) {
        stats.advanced++
        const key = `${doc.pipeline_stage} → ${result.stoppedAt}`
        stats.byStage[key] = (stats.byStage[key] || 0) + 1

        // Log chaque avancement (pas trop verbeux)
        if (stats.advanced <= 10 || stats.advanced % 50 === 0) {
          console.log(`  [${stats.processed}/${docsResult.rows.length}] ${doc.id.slice(0, 8)}... ${doc.pipeline_stage} → ${result.stoppedAt} (${result.advanced.join(' → ')})`)
        }
      } else {
        stats.unchanged++
      }
    } catch (error) {
      stats.errors++
      if (stats.errors <= 5) {
        console.error(`  ERREUR ${doc.id}: ${error instanceof Error ? error.message : error}`)
      }
    }

    // Progress log toutes les 100 docs
    if (stats.processed - lastProgressLog >= 100) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      const rate = (stats.processed / parseFloat(elapsed)).toFixed(1)
      console.log(`  ... ${stats.processed}/${docsResult.rows.length} traités (${elapsed}s, ${rate} docs/s)`)
      lastProgressLog = stats.processed
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1)

  console.log('\n=== Résultats ===')
  console.log(`Traités:   ${stats.processed}`)
  console.log(`Avancés:   ${stats.advanced}`)
  console.log(`Inchangés: ${stats.unchanged}`)
  console.log(`Erreurs:   ${stats.errors}`)
  console.log(`Durée:     ${totalTime}s`)
  console.log('')

  if (Object.keys(stats.byStage).length > 0) {
    console.log('Transitions:')
    for (const [transition, count] of Object.entries(stats.byStage)) {
      console.log(`  ${transition}: ${count}`)
    }
  }

  await db.end()
}

main().catch(err => {
  console.error('ERREUR FATALE:', err)
  process.exit(1)
})
