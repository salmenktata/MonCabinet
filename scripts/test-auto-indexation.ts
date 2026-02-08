/**
 * Test auto-indexation des fichiers pendant le crawl
 * Vérifie que les PDFs téléchargés sont automatiquement parsés et indexés
 *
 * Usage: npx tsx scripts/test-auto-indexation.ts [--source cassation|9anoun] [--pages N]
 */
import 'dotenv/config'

async function main() {
  const sourceArg = process.argv.find(a => a === '--source')
  const sourceIdx = process.argv.indexOf('--source')
  const sourceKey = sourceIdx !== -1 ? process.argv[sourceIdx + 1] : 'cassation'

  const pagesIdx = process.argv.indexOf('--pages')
  const maxPages = pagesIdx !== -1 ? parseInt(process.argv[pagesIdx + 1]) || 5 : 5

  const { Pool } = require('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  // 1. Trouver la source
  const sourcePattern = sourceKey === '9anoun' ? '%9anoun%' : '%cassation%'
  const sourceResult = await pool.query(
    'SELECT * FROM web_sources WHERE base_url LIKE $1 AND is_active = true LIMIT 1',
    [sourcePattern]
  )

  if (sourceResult.rows.length === 0) {
    console.error(`Aucune source active trouvée pour: ${sourceKey}`)
    process.exit(1)
  }

  const sourceRow = sourceResult.rows[0]
  console.log(`\nSource: ${sourceRow.name}`)
  console.log(`URL: ${sourceRow.base_url}`)
  console.log(`auto_index_files: ${sourceRow.auto_index_files}`)

  // 2. Activer auto_index_files temporairement
  const wasAutoIndex = sourceRow.auto_index_files
  if (!wasAutoIndex) {
    await pool.query('UPDATE web_sources SET auto_index_files = true WHERE id = $1', [sourceRow.id])
    console.log(`\nauto_index_files activé temporairement`)
  }

  // 3. Compter les entrées KB/web_files existantes avant le crawl
  const wfBefore = await pool.query(
    `SELECT COUNT(*) as count FROM web_files WHERE web_source_id = $1 AND is_indexed = true`,
    [sourceRow.id]
  )
  const wfCountBefore = parseInt(wfBefore.rows[0].count)
  console.log(`\nFichiers indexés (web_files) avant crawl: ${wfCountBefore}`)

  // 4. Lancer le crawl
  const { getWebSource, crawlSource } = await import('../lib/web-scraper')
  const source = await getWebSource(sourceRow.id)

  if (!source) {
    console.error('Source non trouvée via getWebSource')
    process.exit(1)
  }

  // Forcer auto_index_files à true dans l'objet
  ;(source as any).autoIndexFiles = true

  console.log(`\nLancement du crawl (max ${maxPages} pages, downloadFiles: true)...`)
  console.log('='.repeat(60))

  const startTime = Date.now()
  const result = await crawlSource(source, {
    maxPages,
    maxDepth: 3,
    downloadFiles: true,
    incrementalMode: true, // Sauter les pages déjà crawlées
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // 5. Résultats du crawl
  console.log('\n' + '='.repeat(60))
  console.log('RÉSULTATS DU CRAWL')
  console.log('='.repeat(60))
  console.log(`Durée: ${elapsed}s`)
  console.log(`Pages traitées: ${result.pagesProcessed}`)
  console.log(`Pages nouvelles: ${result.pagesNew}`)
  console.log(`Pages modifiées: ${result.pagesChanged}`)
  console.log(`Pages échouées: ${result.pagesFailed}`)
  console.log(`Fichiers téléchargés: ${result.filesDownloaded}`)
  if (result.errors.length > 0) {
    console.log(`Erreurs (${result.errors.length}):`)
    result.errors.slice(0, 5).forEach((e: any) => console.log(`  - ${e.url || ''}: ${e.error || e}`))
  }

  // 6. Vérifier les entrées web_files après le crawl
  const wfAfter = await pool.query(
    `SELECT COUNT(*) as count FROM web_files WHERE web_source_id = $1 AND is_indexed = true`,
    [sourceRow.id]
  )
  const wfCountAfter = parseInt(wfAfter.rows[0].count)
  const wfNew = wfCountAfter - wfCountBefore

  console.log('\n' + '='.repeat(60))
  console.log('AUTO-INDEXATION')
  console.log('='.repeat(60))
  console.log(`Fichiers indexés avant: ${wfCountBefore}`)
  console.log(`Fichiers indexés après: ${wfCountAfter}`)
  console.log(`Nouveaux fichiers indexés: ${wfNew}`)

  if (wfNew > 0) {
    const recentFiles = await pool.query(
      `SELECT wf.filename, wf.file_type, wf.word_count, wf.chunks_count, wf.extracted_title,
              kb.language, LENGTH(kb.full_text) as content_length
       FROM web_files wf
       LEFT JOIN knowledge_base kb ON kb.id = wf.knowledge_base_id
       WHERE wf.web_source_id = $1 AND wf.is_indexed = true
       ORDER BY wf.indexed_at DESC
       LIMIT 5`,
      [sourceRow.id]
    )
    console.log('\nDerniers fichiers indexés:')
    recentFiles.rows.forEach((row: any) => {
      console.log(`  - ${row.filename} (${row.file_type}, ${row.word_count} mots, ${row.chunks_count} chunks, ${row.language || '?'})`)
    })
  }

  // 7. Résumé web_files
  const webFilesResult = await pool.query(
    `SELECT COUNT(*) as total,
            SUM(CASE WHEN is_downloaded THEN 1 ELSE 0 END) as downloaded,
            SUM(CASE WHEN is_indexed THEN 1 ELSE 0 END) as indexed
     FROM web_files WHERE web_source_id = $1`,
    [sourceRow.id]
  )
  const wfStats = webFilesResult.rows[0]
  console.log(`\nweb_files totaux: ${wfStats.total} (téléchargés: ${wfStats.downloaded}, indexés: ${wfStats.indexed})`)

  // 8. Restaurer auto_index_files si nécessaire
  if (!wasAutoIndex) {
    await pool.query('UPDATE web_sources SET auto_index_files = $1 WHERE id = $2', [wasAutoIndex, sourceRow.id])
    console.log(`\nauto_index_files restauré à ${wasAutoIndex}`)
  }

  console.log('\n✓ Test terminé')
  await pool.end()
  process.exit(0)
}

main().catch(err => {
  console.error('Erreur:', err)
  process.exit(1)
})
