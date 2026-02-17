/**
 * Script d'indexation simple Google Drive
 * Indexe tous les fichiers extraits sans pipeline intelligent
 */

import { db } from '@/lib/db/postgres'
import { indexWebPage } from '@/lib/web-scraper/web-indexer-service'

async function main() {
  console.log('🚀 Démarrage indexation simple Google Drive...\n')

  // Désactiver temporairement le pipeline intelligent
  process.env.ENABLE_INTELLIGENT_PIPELINE = 'false'
  console.log('✓ Pipeline intelligent désactivé (indexation simple)\n')

  // Récupérer l'ID de la source Google Drive
  const sourceResult = await db.query(
    "SELECT id, name FROM web_sources WHERE base_url LIKE 'gdrive://%'"
  )

  if (sourceResult.rows.length === 0) {
    console.error('❌ Aucune source Google Drive trouvée')
    process.exit(1)
  }

  const source = sourceResult.rows[0]
  const sourceId = source.id
  const sourceName = source.name

  console.log(`📁 Source: ${sourceName} (${sourceId})`)

  // Compter les pages à indexer
  const countResult = await db.query(
    `SELECT COUNT(*) as count
     FROM web_pages
     WHERE web_source_id = $1
       AND is_indexed = false
       AND extracted_text IS NOT NULL
       AND LENGTH(extracted_text) > 100`,
    [sourceId]
  )

  const totalToIndex = parseInt(countResult.rows[0].count)
  console.log(`📊 Fichiers à indexer: ${totalToIndex}\n`)

  if (totalToIndex === 0) {
    console.log('✅ Aucun fichier à indexer')
    process.exit(0)
  }

  // Récupérer les pages à indexer
  const pagesResult = await db.query(
    `SELECT id, title, LENGTH(extracted_text) as text_length
     FROM web_pages
     WHERE web_source_id = $1
       AND is_indexed = false
       AND extracted_text IS NOT NULL
       AND LENGTH(extracted_text) > 100
     ORDER BY last_crawled_at DESC`,
    [sourceId]
  )

  let succeeded = 0
  let failed = 0

  // Indexer chaque page
  for (let i = 0; i < pagesResult.rows.length; i++) {
    const page = pagesResult.rows[i]
    const progress = `[${i + 1}/${totalToIndex}]`

    try {
      console.log(`${progress} Indexation: ${page.title} (${page.text_length} chars)`)

      const result = await indexWebPage(page.id)

      if (result.success) {
        succeeded++
        console.log(`  ✓ Succès - ${result.chunksCreated} chunks créés`)
      } else {
        failed++
        console.error(`  ✗ Échec: ${result.error}`)
      }
    } catch (error) {
      failed++
      console.error(`  ✗ Erreur: ${getErrorMessage(error)}`)
    }

    // Petit délai pour éviter de surcharger
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 RÉSULTAT FINAL')
  console.log('='.repeat(60))
  console.log(`✅ Succès: ${succeeded}/${totalToIndex}`)
  console.log(`❌ Échecs: ${failed}/${totalToIndex}`)
  console.log(`📈 Taux de succès: ${((succeeded / totalToIndex) * 100).toFixed(1)}%`)
  console.log('='.repeat(60))

  process.exit(0)
}

main().catch(error => {
  console.error('❌ Erreur fatale:', error)
  process.exit(1)
})
