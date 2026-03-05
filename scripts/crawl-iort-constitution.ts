#!/usr/bin/env tsx
/**
 * Script: Crawl la page Constitution IORT (M4)
 *
 * Télécharge le texte + PDF officiel de la constitution tunisienne
 * depuis iort.gov.tn, sauvegarde en web_pages avec norm_level=constitution,
 * puis déclenche l'indexation KB.
 *
 * Usage:
 *   npx tsx scripts/crawl-iort-constitution.ts
 *   npx tsx scripts/crawl-iort-constitution.ts --index  # Indexer dans KB après crawl
 */

import { db, closePool } from '@/lib/db/postgres'
import {
  IortSessionManager,
  downloadConstitutionFromIort,
  getOrCreateIortSource,
} from '@/lib/web-scraper/iort-scraper-utils'

async function main() {
  const doIndex = process.argv.includes('--index')

  console.log('=== Crawl Constitution IORT ===')
  console.log(`Mode: ${doIndex ? 'crawl + indexation KB' : 'crawl uniquement'}`)

  const session = new IortSessionManager()
  try {
    await session.init()

    const sourceId = await getOrCreateIortSource()
    console.log(`Source IORT: ${sourceId}`)

    const result = await downloadConstitutionFromIort(session, sourceId)

    if (result.saved) {
      console.log(`\n✅ Constitution sauvegardée:`)
      console.log(`   Titre  : ${result.title}`)
      console.log(`   PageId : ${result.pageId}`)
      console.log(`   PDF    : ${result.pdfSize ? Math.round(result.pdfSize / 1024) + ' KB' : 'non téléchargé'}`)

      if (doIndex && result.pageId) {
        console.log('\n📚 Déclenchement indexation KB...')
        // Marquer la page pour indexation via index-web-pages
        await db.query(
          `INSERT INTO web_files (web_page_id, web_source_id, url, file_type, is_downloaded, is_indexed, created_at, updated_at)
           SELECT $1, $2, linked_files->0->>'url', 'pdf', false, false, NOW(), NOW()
           FROM web_pages WHERE id = $1
           AND linked_files != '[]'::jsonb
           AND NOT EXISTS (SELECT 1 FROM web_files wf WHERE wf.web_page_id = $1)`,
          [result.pageId, sourceId],
        )
        console.log('   Fichier PDF marqué pour indexation (statut: pending)')
        console.log('   → Lancer ensuite: curl localhost:3000/api/admin/index-kb depuis le VPS')
      }
    } else {
      console.error('❌ Échec du crawl constitution')
      process.exit(1)
    }
  } finally {
    await session.close().catch(() => {})
    await closePool()
  }
}

main().catch(err => {
  console.error('Erreur fatale:', err)
  process.exit(1)
})
