#!/usr/bin/env tsx
/**
 * Script: Réindexation documents Google Drive longs (>50KB)
 *
 * Usage:
 *   npx tsx scripts/reindex-drive-long-docs.ts [limit] [dryRun]
 *
 * Exemples:
 *   npx tsx scripts/reindex-drive-long-docs.ts 5 true   # Test: 5 docs
 *   npx tsx scripts/reindex-drive-long-docs.ts 20 false # Réel: 20 docs
 *   npx tsx scripts/reindex-drive-long-docs.ts 106 false # Tous: 106 docs
 */

import { reindexLongDocuments } from '@/lib/web-scraper/reindex-long-documents'

const DRIVE_SOURCE_ID = '546d11c8-b3fd-4559-977b-c3572aede0e4'

async function main() {
  const limit = parseInt(process.argv[2] || '10')
  const dryRun = process.argv[3] === 'true'

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🚀 Réindexation Documents Google Drive Longs')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  console.log(`📊 Paramètres:`)
  console.log(`   Source ID: ${DRIVE_SOURCE_ID}`)
  console.log(`   Limite:    ${limit} documents`)
  console.log(`   Mode:      ${dryRun ? '🧪 DRY RUN (simulation)' : '⚡ RÉEL (modifications DB)'}\n`)

  try {
    const result = await reindexLongDocuments(DRIVE_SOURCE_ID, {
      limit,
      dryRun,
    })

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 RÉSULTATS FINAUX')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log(`${result.success ? '✅' : '❌'} Statut: ${result.success ? 'SUCCÈS' : 'ÉCHEC'}`)
    console.log(`📄 Documents traités: ${result.processed}`)
    console.log(`✅ Réussis: ${result.succeeded}`)
    console.log(`❌ Échecs: ${result.failed}`)
    console.log(`✂️ Sections créées: ${result.sectionsCreated}`)
    console.log(`📦 Chunks estimés: ~${result.sectionsCreated * 3}\n`)

    if (result.errors.length > 0) {
      console.log('⚠️  ERREURS:')
      result.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. Page ${err.pageId}: ${err.error}`)
      })
      console.log()
    }

    if (dryRun) {
      console.log('💡 Mode DRY RUN: Aucune modification effectuée')
      console.log('   Pour lancer la réindexation réelle:')
      console.log(`   npx tsx scripts/reindex-drive-long-docs.ts ${limit} false\n`)
    } else {
      console.log('✅ Réindexation terminée!')
      console.log('   Les documents ont été découpés et indexés dans la KB\n')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    process.exit(result.success ? 0 : 1)
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error)
    process.exit(1)
  }
}

main()
