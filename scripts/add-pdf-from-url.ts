#!/usr/bin/env tsx
/**
 * Script: Ajouter le manuel de procédure cour d'appel (Ministère de la Justice)
 *
 * - Utilise le fichier MinIO déjà uploadé lors de la première tentative
 * - Insère le doc KB avec le texte extrait via pdftotext (dans /tmp/manuel_appel.txt)
 * - Lance l'indexation (chunks + embeddings Ollama)
 *
 * Usage: npx tsx scripts/add-pdf-from-url.ts
 */

import { config } from 'dotenv'
config({ path: '.env.production.local' })
config({ path: '.env', override: false })

import fs from 'fs'
import { db, closePool } from '@/lib/db/postgres'
import { indexKnowledgeDocument } from '@/lib/ai/knowledge-base-service'

const MINIO_PATH = 'procedures/1772593821135_manuel_proced_cour_appel.pdf'
const PDF_TEXT_FILE = '/tmp/manuel_appel.txt'
const PDF_SOURCE_URL = 'https://www.justice.gov.tn/fileadmin/medias/manuels_de_procedure/manuel_proced_cour_appel.pdf'

async function main() {
  // 1. Lire le texte extrait par pdftotext
  if (!fs.existsSync(PDF_TEXT_FILE)) {
    throw new Error(`Fichier texte introuvable: ${PDF_TEXT_FILE} — exécuter pdftotext d'abord`)
  }
  const fullText = fs.readFileSync(PDF_TEXT_FILE, 'utf-8').trim()
  console.log(`[add-pdf] Texte chargé: ${fullText.length} caractères`)

  if (fullText.length < 100) {
    throw new Error('Texte trop court — vérifier le fichier pdftotext')
  }

  // 2. Insérer dans la KB
  console.log(`[add-pdf] Insertion dans la KB...`)
  const result = await db.query(
    `INSERT INTO knowledge_base
     (category, language, title, description, metadata, tags, source_file, full_text, uploaded_by, doc_type, rag_enabled, is_active)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::document_type, true, true)
     RETURNING id, title`,
    [
      'procedures',
      'ar',
      "دليل إجراءات محكمة الاستئناف - وزارة العدل",
      "دليل إجراءات محكمة الاستئناف الصادر عن وزارة العدل وحقوق الإنسان التونسية — Manuel officiel de procédure de la cour d'appel (Ministère de la Justice tunisien).",
      JSON.stringify({
        source_url: PDF_SOURCE_URL,
        sourceOrigin: 'autre',
        publisher: 'وزارة العدل وحقوق الإنسان - Ministère de la Justice de Tunisie',
        norm_level_hint: 'arrete_min',
      }),
      ['إجراءات', 'محكمة الاستئناف', 'دليل', 'وزارة العدل', 'رسمي', 'procédure', "cour d'appel"],
      MINIO_PATH,
      fullText,
      null, // uploaded_by (null = système)
      'PROC',
    ]
  )

  const doc = result.rows[0]
  console.log(`[add-pdf] Doc créé: ID=${doc.id}, titre="${doc.title}"`)

  // 3. Indexer (chunks + embeddings)
  console.log(`[add-pdf] Indexation chunks + embeddings Ollama...`)
  const indexResult = await indexKnowledgeDocument(doc.id)

  if (indexResult.success) {
    console.log(`\n✅ Document indexé avec succès:`)
    console.log(`   ID     : ${doc.id}`)
    console.log(`   Chunks : ${indexResult.chunksCreated}`)
    console.log(`   Provider: ${indexResult.embeddingProvider || 'inconnu'}`)
    console.log()
    console.log(`🔗 Admin: https://qadhya.tn/super-admin/knowledge-base/${doc.id}`)
  } else {
    console.error(`\n❌ Échec indexation:`, indexResult.error)
    process.exit(1)
  }

  await closePool()
}

main().catch(err => {
  console.error('[add-pdf] Erreur fatale:', err)
  process.exit(1)
})
