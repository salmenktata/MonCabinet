/**
 * Test direct de l'auto-indexation : télécharge un PDF d'arrêt, l'upload dans MinIO, et l'indexe
 * Usage: npx tsx scripts/test-auto-index-direct.ts [--count N]
 */
import 'dotenv/config'

async function main() {
  const countIdx = process.argv.indexOf('--count')
  const count = countIdx !== -1 ? parseInt(process.argv[countIdx + 1]) || 3 : 3

  const { Pool } = require('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const sourceId = 'a3cb63fa-a1a6-4d7e-a347-6929dfce9d44' // cassation.tn

  // 1. Trouver des pages avec des PDFs d'arrêts non téléchargés
  const pagesResult = await pool.query(
    `SELECT id, url, linked_files::text
     FROM web_pages
     WHERE web_source_id = $1
       AND linked_files IS NOT NULL
       AND linked_files != '[]'
     ORDER BY created_at DESC
     LIMIT $2`,
    [sourceId, count * 2] // Double pour compenser les filtres
  )

  // Filtrer les pages avec des PDFs d'arrêts (pas le planning)
  const pages = pagesResult.rows.filter((row: any) => {
    const files = JSON.parse(row.linked_files)
    return files.some((f: any) => f.type === 'pdf' && !f.url.includes('planning'))
  }).slice(0, count)

  console.log(`\nPages avec PDFs d'arrêts: ${pages.length}`)

  if (pages.length === 0) {
    console.log('Aucune page avec des PDFs trouvée')
    await pool.end()
    process.exit(0)
  }

  // 2. Importer les services
  const { downloadFile } = await import('../lib/web-scraper/scraper-service')
  const { uploadFile } = await import('../lib/storage/minio')
  const { indexFile } = await import('../lib/web-scraper/file-indexer-service')

  let successCount = 0
  let totalChunks = 0

  for (const page of pages) {
    const files = JSON.parse(page.linked_files)
    const pdfFile = files.find((f: any) => f.type === 'pdf' && !f.url.includes('planning'))
    if (!pdfFile) continue

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Page: ${page.url.substring(0, 80)}`)
    console.log(`PDF: ${pdfFile.url}`)

    try {
      // 3. Télécharger le PDF
      console.log('  Téléchargement...')
      const dlResult = await downloadFile(pdfFile.url, { timeout: 30000 })
      if (!dlResult.success || !dlResult.buffer) {
        console.log(`  ÉCHEC téléchargement: ${dlResult.error}`)
        continue
      }
      console.log(`  Taille: ${(dlResult.buffer.length / 1024).toFixed(0)} Ko`)

      // 4. Upload vers MinIO (bucket web-files)
      const minioPath = `web-scraper/${sourceId}/${Date.now()}_${pdfFile.filename}`
      await uploadFile(dlResult.buffer, minioPath, {
        sourceUrl: pdfFile.url,
        sourceId: sourceId,
      }, 'web-files')
      console.log(`  Upload MinIO: ${minioPath}`)

      // 5. Préparer le LinkedFile avec minioPath
      const linkedFile = {
        ...pdfFile,
        downloaded: true,
        minioPath,
        size: dlResult.buffer.length,
      }

      // 6. Indexer le fichier
      console.log('  Indexation...')
      const indexResult = await indexFile(
        linkedFile,
        page.id,
        sourceId,
        'Cour de Cassation - Jurisprudence',
        'jurisprudence'
      )

      if (indexResult.success) {
        successCount++
        totalChunks += indexResult.chunksCreated
        console.log(`  OK: ${indexResult.chunksCreated} chunks créés (KB ID: ${indexResult.fileId})`)
      } else {
        console.log(`  ÉCHEC indexation: ${indexResult.error}`)
      }

      // 7. Mettre à jour les linked_files de la page
      const updatedFiles = files.map((f: any) =>
        f.url === pdfFile.url ? linkedFile : f
      )
      await pool.query(
        'UPDATE web_pages SET linked_files = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updatedFiles), page.id]
      )
    } catch (err: any) {
      console.log(`  ERREUR: ${err.message}`)
    }
  }

  // 8. Résumé
  console.log(`\n${'='.repeat(60)}`)
  console.log('RÉSUMÉ AUTO-INDEXATION')
  console.log('='.repeat(60))
  console.log(`PDFs traités: ${pages.length}`)
  console.log(`Succès: ${successCount}`)
  console.log(`Chunks créés: ${totalChunks}`)

  // 9. Vérifier web_files
  const wfResult = await pool.query(
    `SELECT COUNT(*) as count FROM web_files WHERE web_source_id = $1 AND is_indexed = true`,
    [sourceId]
  )
  console.log(`web_files indexés: ${wfResult.rows[0].count}`)

  await pool.end()
  process.exit(0)
}

main().catch(err => {
  console.error('Erreur:', err)
  process.exit(1)
})
