#!/usr/bin/env npx tsx
/**
 * Script semi-automatique pour peupler les goldChunkIds dans le gold dataset
 *
 * Usage:
 *   npx tsx scripts/populate-gold-chunks.ts --auto --skip-done
 *   npx tsx scripts/populate-gold-chunks.ts --interactive --domain droit_civil
 *   npx tsx scripts/populate-gold-chunks.ts --auto --skip-done --threshold 0.65
 *
 * @module scripts/populate-gold-chunks
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { searchKnowledgeBaseHybrid } from '../lib/ai/knowledge-base-service'
import type { GoldEvalCase } from '../lib/ai/rag-eval-types'

// =============================================================================
// CLI ARGS
// =============================================================================

const args = process.argv.slice(2)
const isAuto = args.includes('--auto')
const isInteractive = args.includes('--interactive')
const skipDone = args.includes('--skip-done')
const domainArg = args.find(a => a.startsWith('--domain='))?.split('=')[1] || args[args.indexOf('--domain') + 1]
const thresholdArg = args.find(a => a.startsWith('--threshold='))?.split('=')[1]
const threshold = thresholdArg ? parseFloat(thresholdArg) : 0.70
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1]
const limit = limitArg ? parseInt(limitArg) : undefined

if (!isAuto && !isInteractive) {
  console.log(`Usage: npx tsx scripts/populate-gold-chunks.ts [--auto|--interactive] [options]

Options:
  --auto           Accepte automatiquement les top-5 chunks avec similarity >= ${threshold}
  --interactive    Affiche top-10, l'utilisateur valide manuellement
  --skip-done      Saute les questions qui ont deja des goldChunkIds
  --domain <X>     Filtre par domaine (ex: droit_civil)
  --threshold <N>  Seuil de similarité pour mode auto (défaut: 0.70)
  --limit <N>      Nombre max de questions à traiter
`)
  process.exit(0)
}

// =============================================================================
// MAIN
// =============================================================================

const GOLD_PATH = path.join(process.cwd(), 'data', 'gold-eval-dataset.json')

async function main() {
  if (!fs.existsSync(GOLD_PATH)) {
    console.error('Gold dataset non trouvé:', GOLD_PATH)
    process.exit(1)
  }

  const dataset: GoldEvalCase[] = JSON.parse(fs.readFileSync(GOLD_PATH, 'utf-8'))
  console.log(`Dataset chargé: ${dataset.length} questions`)

  let cases = dataset
  if (domainArg) {
    cases = cases.filter(c => c.domain === domainArg)
    console.log(`Filtrage domaine "${domainArg}": ${cases.length} questions`)
  }
  if (skipDone) {
    const before = cases.length
    cases = cases.filter(c => !c.goldChunkIds || c.goldChunkIds.length === 0)
    console.log(`Skip done: ${before - cases.length} déjà peuplées, ${cases.length} restantes`)
  }
  if (limit) {
    cases = cases.slice(0, limit)
    console.log(`Limite: ${cases.length} questions`)
  }

  if (cases.length === 0) {
    console.log('Aucune question à traiter.')
    process.exit(0)
  }

  let populated = 0
  let skipped = 0

  const rl = isInteractive ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null

  for (let i = 0; i < cases.length; i++) {
    const evalCase = cases[i]
    console.log(`\n[${ i + 1}/${cases.length}] ${evalCase.id} — ${evalCase.question.substring(0, 80)}...`)

    try {
      const results = await searchKnowledgeBaseHybrid(evalCase.question, {
        limit: 10,
        operationName: 'populate-gold-chunks',
      })

      if (results.length === 0) {
        console.log('  Aucun résultat trouvé, skip.')
        skipped++
        continue
      }

      if (isAuto) {
        // Auto: prendre top-5 avec similarity >= threshold
        const accepted = results
          .slice(0, 5)
          .filter(r => r.similarity >= threshold)

        if (accepted.length === 0) {
          console.log(`  Aucun chunk avec similarity >= ${threshold} (max: ${results[0].similarity.toFixed(3)})`)
          skipped++
          continue
        }

        const chunkIds = accepted.map(r => r.chunkId)
        const docIds = [...new Set(accepted.map(r => r.knowledgeBaseId))]

        // Mettre à jour dans le dataset complet
        const idx = dataset.findIndex(d => d.id === evalCase.id)
        if (idx >= 0) {
          dataset[idx].goldChunkIds = chunkIds
          dataset[idx].goldDocumentIds = docIds
        }

        console.log(`  Auto-accepté: ${chunkIds.length} chunks (sim: ${accepted.map(r => r.similarity.toFixed(3)).join(', ')})`)
        populated++
      } else if (isInteractive && rl) {
        // Interactive: afficher top-10 et laisser l'utilisateur choisir
        console.log('  Top 10 résultats:')
        results.forEach((r, idx) => {
          const contentPreview = r.chunkContent.replace(/\n/g, ' ').substring(0, 120)
          console.log(`    [${idx}] sim=${r.similarity.toFixed(3)} | ${r.title?.substring(0, 40) || 'N/A'} | ${contentPreview}...`)
        })

        const answer = await askQuestion(rl, '  Sélectionner les indices (ex: 0,1,2) ou "s" pour skip: ')

        if (answer.toLowerCase() === 's' || answer.trim() === '') {
          skipped++
          continue
        }

        const indices = answer.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n < results.length)

        if (indices.length === 0) {
          skipped++
          continue
        }

        const selected = indices.map(idx => results[idx])
        const chunkIds = selected.map(r => r.chunkId)
        const docIds = [...new Set(selected.map(r => r.knowledgeBaseId))]

        const datasetIdx = dataset.findIndex(d => d.id === evalCase.id)
        if (datasetIdx >= 0) {
          dataset[datasetIdx].goldChunkIds = chunkIds
          dataset[datasetIdx].goldDocumentIds = docIds
        }

        console.log(`  Sélectionné: ${chunkIds.length} chunks`)
        populated++
      }

      // Sauvegarde incrémentale toutes les 5 questions
      if ((i + 1) % 5 === 0) {
        fs.writeFileSync(GOLD_PATH, JSON.stringify(dataset, null, 2))
        console.log(`  [Sauvegarde incrémentale: ${i + 1}/${cases.length}]`)
      }
    } catch (error) {
      console.error(`  Erreur: ${error instanceof Error ? error.message : error}`)
      skipped++
    }
  }

  // Sauvegarde finale
  fs.writeFileSync(GOLD_PATH, JSON.stringify(dataset, null, 2))
  console.log(`\nTerminé! Peuplé: ${populated}, Skippé: ${skipped}`)
  console.log(`Dataset sauvegardé: ${GOLD_PATH}`)

  rl?.close()
  process.exit(0)
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer))
  })
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
