#!/usr/bin/env tsx
/**
 * Script d'optimisation automatique des crawlers
 * Usage:
 *   npm run optimize:crawlers              # Optimiser toutes les sources
 *   npm run optimize:crawlers -- --dry-run # Simuler sans appliquer
 *   npm run optimize:crawlers -- --source <id> # Optimiser une source spécifique
 */

import { optimizeWebSource, optimizeAllSources, detectSiteType } from '@/lib/web-scraper/crawler-optimizer-service'
import { db } from '@/lib/db/postgres'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const sourceIdIndex = args.indexOf('--source')
const sourceId = sourceIdIndex >= 0 ? args[sourceIdIndex + 1] : null

async function main() {
  console.log('🚀 Crawler Optimizer\n')

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be applied\n')
  }

  try {
    if (sourceId) {
      // Optimiser une source spécifique
      console.log(`Optimizing source: ${sourceId}\n`)

      // Récupérer les infos de la source
      const result = await db.query(
        `SELECT id, name, base_url FROM web_sources WHERE id = $1`,
        [sourceId]
      )

      if (result.rows.length === 0) {
        console.error(`❌ Source ${sourceId} not found`)
        process.exit(1)
      }

      const source = result.rows[0] as any

      console.log(`📍 Source: ${source.name}`)
      console.log(`🔗 URL: ${source.base_url}\n`)

      // Détecter le type
      console.log('🔍 Detecting site type...')
      const detection = await detectSiteType(source.base_url)
      console.log(`   Type: ${detection.type}`)
      console.log(`   Confidence: ${detection.confidence}%`)
      console.log(`   Evidence:`)
      detection.evidence.forEach(e => console.log(`     - ${e}`))
      console.log()

      // Appliquer l'optimisation
      if (!dryRun) {
        console.log('⚙️  Applying optimizations...')
        const optimization = await optimizeWebSource(sourceId)

        if (optimization.success) {
          console.log(`✅ Successfully applied ${optimization.appliedProfile} profile\n`)

          if (Object.keys(optimization.changes).length > 0) {
            console.log('📝 Changes applied:')
            Object.entries(optimization.changes).forEach(([key, change]) => {
              console.log(`   ${key}:`)
              console.log(`     Before: ${JSON.stringify(change.before)}`)
              console.log(`     After:  ${JSON.stringify(change.after)}`)
            })
            console.log()
          } else {
            console.log('ℹ️  No changes needed - already optimized\n')
          }

          if (optimization.warnings) {
            console.log('⚠️  Warnings:')
            optimization.warnings.forEach(w => console.log(`   - ${w}`))
            console.log()
          }

          if (optimization.recommendations) {
            console.log('💡 Recommendations:')
            optimization.recommendations.forEach(r => console.log(`   - ${r}`))
            console.log()
          }
        } else {
          console.error('❌ Optimization failed')
          if (optimization.warnings) {
            optimization.warnings.forEach(w => console.error(`   - ${w}`))
          }
          process.exit(1)
        }
      }
    } else {
      // Optimiser toutes les sources
      console.log('Optimizing all active sources...\n')

      const results = await optimizeAllSources(dryRun)

      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMMARY')
      console.log('='.repeat(60))
      console.log(`Total sources: ${results.total}`)
      console.log(`✅ Optimized: ${results.optimized}`)
      console.log(`⏭️  Skipped (already optimal): ${results.skipped}`)
      console.log(`❌ Failed: ${results.failed}`)
      console.log('='.repeat(60))

      // Détails par source
      console.log('\n📋 Detailed Results:\n')
      results.results.forEach(({ sourceId, name, result }) => {
        const changeCount = Object.keys(result.changes).length
        const icon = result.success
          ? changeCount > 0
            ? '✅'
            : '⏭️'
          : '❌'

        console.log(`${icon} ${name} (${sourceId})`)
        console.log(`   Type: ${result.detectedType}`)
        console.log(`   Profile: ${result.appliedProfile}`)

        if (changeCount > 0) {
          console.log(`   Changes: ${Object.keys(result.changes).join(', ')}`)
        }

        if (result.warnings) {
          result.warnings.forEach(w => console.log(`   ⚠️  ${w}`))
        }

        console.log()
      })

      if (dryRun) {
        console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.\n')
      }
    }

    console.log('✅ Done!\n')
    process.exit(0)
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
