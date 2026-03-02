#!/usr/bin/env tsx
/**
 * Script ciblé : indexer le PDF constitution IORT dans la KB
 *
 * - Télécharge le PDF depuis MinIO
 * - Extrait le texte via parseFile
 * - Met à jour le doc KB existant avec full_text
 * - Déclenche indexation chunks + embeddings
 *
 * Usage: npx tsx scripts/index-constitution-pdf.ts
 */

import { db, closePool } from '@/lib/db/postgres'
import { downloadWebFile } from '@/lib/web-scraper/storage-adapter'
import { parseFile } from '@/lib/web-scraper/file-parser-service'
import { normalizeText, detectTextLanguage } from '@/lib/web-scraper/content-extractor'
import { indexKnowledgeDocument } from '@/lib/ai/knowledge-base-service'

const KB_ID = '7d2530c9-a75f-4338-aafb-09cdd9cfe246'
const MINIO_PATH = 'iort/d5c992c7-0108-4252-9d71-35cb4ee63e6f/دستور-الجمهورية-التونسية-917bc896.pdf'

async function main() {
  console.log('[index-constitution] Démarrage indexation PDF constitution IORT')

  // 1. Télécharger le PDF depuis MinIO
  console.log('[index-constitution] Téléchargement PDF depuis MinIO...')
  const download = await downloadWebFile(MINIO_PATH)
  if (!download.success || !download.buffer) {
    console.error('[index-constitution] Erreur téléchargement:', download.error)
    process.exit(1)
  }
  console.log(`[index-constitution] PDF téléchargé: ${download.buffer.length} bytes`)

  // 2. Extraire le texte du PDF
  console.log('[index-constitution] Extraction texte PDF...')
  const parsed = await parseFile(download.buffer, 'pdf')
  if (!parsed.success || !parsed.text || parsed.text.length < 100) {
    console.error('[index-constitution] Erreur extraction texte:', parsed.error || 'Texte insuffisant')
    process.exit(1)
  }
  console.log(`[index-constitution] Texte extrait: ${parsed.text.length} caractères`)

  // 3. Normaliser le texte
  const normalizedText = normalizeText(parsed.text)
  const detectedLang = detectTextLanguage(normalizedText) || 'ar'
  const language: 'ar' | 'fr' = (detectedLang === 'ar' || detectedLang === 'fr') ? detectedLang : 'ar'
  console.log(`[index-constitution] Langue détectée: ${language}`)

  // 4. Mettre à jour le KB doc avec full_text
  await db.query(
    `UPDATE knowledge_base SET full_text = $2, language = $3, updated_at = NOW() WHERE id = $1`,
    [KB_ID, normalizedText, language]
  )
  console.log('[index-constitution] full_text mis à jour dans KB doc')

  // 5. Déclencher l'indexation via indexKnowledgeDocument
  console.log('[index-constitution] Indexation chunks + embeddings...')
  const result = await indexKnowledgeDocument(KB_ID)

  if (result.success) {
    console.log(`\n✅ Constitution indexée avec succès:`)
    console.log(`   Chunks créés : ${result.chunksCreated}`)
    console.log(`   Provider     : ${result.embeddingProvider || 'inconnu'}`)
  } else {
    console.error(`\n❌ Échec indexation:`, result.error)
    process.exit(1)
  }

  await closePool()
}

main().catch(err => {
  console.error('[index-constitution] Erreur fatale:', err)
  process.exit(1)
})
