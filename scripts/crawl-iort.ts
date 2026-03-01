#!/usr/bin/env tsx
/**
 * Script: Crawl IORT (Journal Officiel - iort.gov.tn)
 *
 * Usage:
 *   npx tsx scripts/crawl-iort.ts --year 2026
 *   npx tsx scripts/crawl-iort.ts --from 2020 --to 2026
 *   npx tsx scripts/crawl-iort.ts --year 2025 --type law
 *   npx tsx scripts/crawl-iort.ts --from 2020 --to 2026 --resume
 *
 * Options:
 *   --year <N>     Année unique à crawler
 *   --from <N>     Année de début (inclusive)
 *   --to <N>       Année de fin (inclusive)
 *   --type <type>  Type de texte: law, decree, order, decision, notice (tous si absent)
 *   --resume       Reprendre le crawl (skip combos déjà complétés)
 *   --dry-run      Afficher le plan sans exécuter
 */

import { db, closePool } from '@/lib/db/postgres'
import {
  IortSessionManager,
  IORT_TEXT_TYPES,
  IORT_RATE_CONFIG,
  crawlYearType,
  getOrCreateIortSource,
  updateIortSourceStats,
  type IortTextType,
  type IortCrawlStats,
} from '@/lib/web-scraper/iort-scraper-utils'
import { indexSourcePages } from '@/lib/web-scraper/web-indexer-service'

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

function parseArgs(): {
  years: number[]
  types: IortTextType[]
  resume: boolean
  dryRun: boolean
} {
  const args = process.argv.slice(2)
  let years: number[] = []
  let types: IortTextType[] = []
  let resume = false
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--year':
        years = [parseInt(args[++i], 10)]
        break
      case '--from': {
        const from = parseInt(args[++i], 10)
        const toIdx = args.indexOf('--to')
        const to = toIdx !== -1 ? parseInt(args[toIdx + 1], 10) : from
        years = []
        // Décroissant (année récente d'abord)
        for (let y = to; y >= from; y--) {
          years.push(y)
        }
        break
      }
      case '--to':
        // Déjà traité par --from
        i++
        break
      case '--type':
        types = [args[++i] as IortTextType]
        break
      case '--resume':
        resume = true
        break
      case '--dry-run':
        dryRun = true
        break
    }
  }

  // Défauts
  if (years.length === 0) {
    years = [new Date().getFullYear()]
  }

  if (types.length === 0) {
    types = Object.keys(IORT_TEXT_TYPES) as IortTextType[]
  }

  // Valider
  for (const type of types) {
    if (!(type in IORT_TEXT_TYPES)) {
      console.error(`Type invalide: ${type}. Valides: ${Object.keys(IORT_TEXT_TYPES).join(', ')}`)
      process.exit(1)
    }
  }

  for (const year of years) {
    if (isNaN(year) || year < 1956 || year > 2030) {
      console.error(`Année invalide: ${year}. Plage: 1956-2030`)
      process.exit(1)
    }
  }

  return { years, types, resume, dryRun }
}

// =============================================================================
// RÉSUMABILITÉ
// =============================================================================

/**
 * Vérifie si un combo année/type a déjà été crawlé
 * (basé sur le nombre de pages existantes)
 */
async function isComboCompleted(
  sourceId: string,
  year: number,
  textType: IortTextType,
): Promise<boolean> {
  const result = await db.query(
    `SELECT COUNT(*) as count FROM web_pages
     WHERE web_source_id = $1
     AND structured_data->>'year' = $2
     AND structured_data->>'textType' = $3`,
    [sourceId, String(year), IORT_TEXT_TYPES[textType].ar],
  )
  const count = parseInt(result.rows[0].count)
  // Considérer complété si on a déjà au moins 1 page
  // (le vrai check serait de comparer au totalResults, mais on n'a pas cette info)
  return count > 0
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const { years, types, resume, dryRun } = parseArgs()

  console.log('═══════════════════════════════════════════════')
  console.log(' IORT Scraper - Journal Officiel (iort.gov.tn)')
  console.log('═══════════════════════════════════════════════')
  console.log(`Années   : ${years.join(', ')}`)
  console.log(`Types    : ${types.map(t => IORT_TEXT_TYPES[t].fr).join(', ')}`)
  console.log(`Resume   : ${resume ? 'Oui' : 'Non'}`)
  console.log(`Combos   : ${years.length * types.length}`)
  console.log('═══════════════════════════════════════════════\n')

  if (dryRun) {
    console.log('Mode dry-run — plan d\'exécution:\n')
    for (const year of years) {
      for (const type of types) {
        console.log(`  ${year} / ${IORT_TEXT_TYPES[type].fr} (${IORT_TEXT_TYPES[type].ar})`)
      }
    }
    console.log('\nAjouter --year ou --from/--to pour exécuter.')
    process.exit(0)
  }

  // Obtenir ou créer la source IORT
  const sourceId = await getOrCreateIortSource()
  console.log(`Source IORT: ${sourceId}\n`)

  // Initialiser la session
  const session = new IortSessionManager()
  const allStats: IortCrawlStats[] = []

  // Gérer l'arrêt propre
  const abortController = new AbortController()
  let isShuttingDown = false

  const shutdown = async () => {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log('\n\n⚠ Signal d\'arrêt reçu, fin propre...')
    abortController.abort()
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    await session.init()
    await session.navigateToSearch()

    let comboIndex = 0
    const totalCombos = years.length * types.length

    for (const year of years) {
      for (const type of types) {
        comboIndex++

        if (abortController.signal.aborted) break

        console.log(`\n━━━ Combo ${comboIndex}/${totalCombos}: ${year} / ${IORT_TEXT_TYPES[type].fr} ━━━`)

        // Résumabilité
        if (resume) {
          const completed = await isComboCompleted(sourceId, year, type)
          if (completed) {
            console.log(`[IORT] Combo déjà crawlé, skip (--resume)`)
            continue
          }
        }

        // Crawl
        const stats = await crawlYearType(
          session,
          sourceId,
          year,
          type,
          abortController.signal,
        )
        allStats.push(stats)

        // Mettre à jour les stats source
        await updateIortSourceStats(sourceId)

        // Pause entre combos
        if (comboIndex < totalCombos && !abortController.signal.aborted) {
          console.log(`[IORT] Pause ${IORT_RATE_CONFIG.comboPauseMs / 1000}s entre combos...`)
          await new Promise(resolve => setTimeout(resolve, IORT_RATE_CONFIG.comboPauseMs))
        }
      }

      if (abortController.signal.aborted) break
    }
  } catch (err) {
    console.error('\nErreur fatale:', err instanceof Error ? err.message : err)
  } finally {
    await session.close()

    // Résumé final
    console.log('\n\n═══════════════════════════════════════════════')
    console.log(' RÉSUMÉ')
    console.log('═══════════════════════════════════════════════')

    let totalCrawled = 0
    let totalUpdated = 0
    let totalSkipped = 0
    let totalErrors = 0

    for (const stats of allStats) {
      console.log(
        `  ${stats.year}/${stats.textType}: ${stats.crawled} nouveaux, ${stats.updated} mis à jour, ` +
        `${stats.skipped} inchangés, ${stats.errors} erreurs (total: ${stats.totalResults})`
      )
      totalCrawled += stats.crawled
      totalUpdated += stats.updated
      totalSkipped += stats.skipped
      totalErrors += stats.errors
    }

    console.log('───────────────────────────────────────────────')
    console.log(`  TOTAL: ${totalCrawled} nouveaux, ${totalUpdated} mis à jour, ${totalSkipped} inchangés, ${totalErrors} erreurs`)
    console.log('═══════════════════════════════════════════════\n')

    // Indexer automatiquement les nouvelles pages en KB
    if (totalCrawled + totalUpdated > 0) {
      console.log(`[IORT] Lancement indexation KB pour ${totalCrawled + totalUpdated} pages nouvelles/modifiées...`)
      try {
        const indexResult = await indexSourcePages(sourceId, { limit: 1000, reindex: false })
        console.log(`[IORT] Indexation KB terminée: ${indexResult.indexed} indexés, ${indexResult.skipped} ignorés, ${indexResult.errors} erreurs`)
      } catch (indexErr) {
        console.error('[IORT] Erreur indexation KB:', indexErr instanceof Error ? indexErr.message : indexErr)
      }
    } else {
      console.log('[IORT] Aucune page nouvelle/modifiée — indexation KB ignorée')
    }

    await closePool()
  }
}

main().catch(err => {
  console.error('Erreur non gérée:', err)
  process.exit(1)
})
