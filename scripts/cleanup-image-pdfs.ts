/**
 * Script de nettoyage des PDFs image mal indexés dans la Knowledge Base
 *
 * Cible : docs avec ocr_applied=true + liés à web_files (web crawl) + confiance OCR < 60%
 * Ces documents proviennent de PDFs purement image (scan sans couche texte) dont l'OCR
 * a produit du texte de mauvaise qualité qui pollue le RAG.
 *
 * Usage :
 *   Dry run : npx tsx scripts/cleanup-image-pdfs.ts
 *   Prod    : DATABASE_URL=postgres://moncabinet:...@127.0.0.1:5434/qadhya npx tsx scripts/cleanup-image-pdfs.ts
 *   Suppr   : DATABASE_URL=... npx tsx scripts/cleanup-image-pdfs.ts --delete
 */

import { Pool } from 'pg'

const isDelete = process.argv.includes('--delete')
const CONFIDENCE_THRESHOLD = 60  // Supprimer si confiance OCR moyenne < 60% ou NULL
const BATCH_SIZE = 50

interface Candidate {
  id: string
  title: string
  category: string
  source: string
  chunks: number
  avg_confidence: number | null
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  console.log(`\n[Cleanup Image PDFs] Mode : ${isDelete ? '⚠️  SUPPRESSION RÉELLE' : '🔍 DRY RUN'}`)
  console.log(`[Cleanup Image PDFs] Seuil confiance OCR : < ${CONFIDENCE_THRESHOLD}% ou NULL\n`)

  // Identifier les candidats à la suppression
  const { rows: candidates } = await pool.query<Candidate>(`
    SELECT
      kb.id,
      kb.title,
      kb.category,
      ws.base_url AS source,
      COUNT(kbc.id)::int AS chunks,
      ROUND(AVG((kbc.metadata->>'ocr_confidence')::float)::numeric, 1) AS avg_confidence
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    JOIN web_files wf ON wf.knowledge_base_id = kb.id
    JOIN web_pages wp ON wf.web_page_id = wp.id
    JOIN web_sources ws ON wp.web_source_id = ws.id
    WHERE kb.ocr_applied = true
      AND kb.is_indexed = true
    GROUP BY kb.id, kb.title, kb.category, ws.base_url
    HAVING AVG((kbc.metadata->>'ocr_confidence')::float) < $1
        OR AVG((kbc.metadata->>'ocr_confidence')::float) IS NULL
    ORDER BY avg_confidence ASC NULLS FIRST
  `, [CONFIDENCE_THRESHOLD])

  if (candidates.length === 0) {
    console.log('✅ Aucun document à nettoyer.')
    await pool.end()
    return
  }

  // Résumé global
  const totalChunks = candidates.reduce((s, c) => s + c.chunks, 0)
  console.log(`📊 Résumé : ${candidates.length} docs / ${totalChunks} chunks concernés\n`)

  // Breakdown par tranche de confiance
  const nullConf = candidates.filter(c => c.avg_confidence === null)
  const veryLow  = candidates.filter(c => c.avg_confidence !== null && c.avg_confidence < 40)
  const low      = candidates.filter(c => c.avg_confidence !== null && c.avg_confidence >= 40 && c.avg_confidence < 60)

  console.log('  Confiance NULL (OCR sans résultat) :', nullConf.length, 'docs')
  console.log('  Confiance 0–40%                    :', veryLow.length, 'docs')
  console.log('  Confiance 40–60%                   :', low.length, 'docs')

  // Breakdown par source
  const bySource = new Map<string, number>()
  for (const c of candidates) {
    bySource.set(c.source, (bySource.get(c.source) || 0) + 1)
  }
  console.log('\n  Par source web :')
  for (const [url, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${url} : ${count} docs`)
  }

  // Afficher les 20 premiers
  console.log('\n  Premiers candidats (20 max) :')
  for (const c of candidates.slice(0, 20)) {
    const conf = c.avg_confidence !== null ? `${c.avg_confidence}%` : 'NULL'
    console.log(`    [${conf}] ${c.chunks} chunks — ${c.title.substring(0, 80)}`)
  }
  if (candidates.length > 20) {
    console.log(`    ... et ${candidates.length - 20} autres`)
  }

  if (!isDelete) {
    console.log('\n💡 Ajouter --delete pour supprimer ces documents.')
    await pool.end()
    return
  }

  // Suppression par batch
  console.log(`\n🗑️  Suppression de ${candidates.length} documents par batches de ${BATCH_SIZE}...`)
  const ids = candidates.map(c => c.id)
  let deleted = 0

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE)
    // CASCADE → knowledge_base_chunks supprimés automatiquement
    // ON DELETE SET NULL → web_files.knowledge_base_id = NULL automatiquement
    await pool.query('DELETE FROM knowledge_base WHERE id = ANY($1)', [batch])
    deleted += batch.length
    console.log(`  ✓ ${deleted}/${ids.length} supprimés`)
  }

  console.log(`\n✅ Nettoyage terminé : ${deleted} docs / ${totalChunks} chunks supprimés.`)
  await pool.end()
}

main().catch(err => {
  console.error('[Cleanup Image PDFs] Erreur :', err)
  process.exit(1)
})
