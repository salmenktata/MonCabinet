#!/usr/bin/env npx tsx
/**
 * POC - Consolider le Code Pénal Tunisien
 *
 * Fusionne toutes les pages crawlées en un texte consolidé
 * avec structure hiérarchique (Livre > Chapitre > Article).
 *
 * Prérequis: avoir exécuté poc-create-code-penal-document.ts
 *
 * Usage: npx tsx scripts/poc-consolidate-code-penal.ts
 */

import { db } from '@/lib/db/postgres'
import { getDocumentByCitationKey } from '@/lib/legal-documents/document-service'
import { consolidateDocument } from '@/lib/legal-documents/content-consolidation-service'

const CITATION_KEY = 'code-penal-tunisien'

async function main() {
  console.log('=== POC Code Pénal - Consolidation ===\n')

  // 1. Trouver le document
  const document = await getDocumentByCitationKey(CITATION_KEY)
  if (!document) {
    console.error(`❌ Document ${CITATION_KEY} non trouvé. Exécuter d'abord poc-create-code-penal-document.ts`)
    process.exit(1)
  }

  console.log(`📋 Document: ${document.citationKey}`)
  console.log(`   ID: ${document.id}`)
  console.log(`   Pages: ${document.pageCount}`)
  console.log(`   Status actuel: ${document.consolidationStatus}`)
  console.log()

  // 2. Consolider
  console.log('🔄 Consolidation en cours...\n')
  const result = await consolidateDocument(document.id)

  if (!result.success) {
    console.error('❌ Échec consolidation:', result.errors)
    process.exit(1)
  }

  // 3. Résultats
  console.log('✅ Consolidation réussie:')
  console.log(`   Pages traitées: ${result.totalPages}`)
  console.log(`   Articles: ${result.totalArticles}`)
  console.log(`   Mots totaux: ${result.totalWords}`)
  console.log(`   Texte consolidé: ${result.consolidatedTextLength} caractères`)
  console.log()

  // 4. Structure
  console.log('📊 Structure:')
  for (const book of result.structure.books) {
    console.log(`   📖 Livre ${book.number}: ${book.titleAr || book.titleFr || '(sans titre)'}`)
    for (const chapter of book.chapters) {
      const articleCount = chapter.articles.length
      console.log(`      📑 ${chapter.titleAr || `Chapitre ${chapter.number || '?'}`}: ${articleCount} articles`)
    }
  }
  console.log()

  if (result.errors.length > 0) {
    console.log(`⚠️ Warnings (${result.errors.length}):`)
    for (const err of result.errors.slice(0, 10)) {
      console.log(`   - ${err}`)
    }
    if (result.errors.length > 10) {
      console.log(`   ... et ${result.errors.length - 10} de plus`)
    }
  }

  // 5. Vérification DB
  const verification = await db.query<any>(
    `SELECT citation_key, consolidation_status, page_count,
            length(consolidated_text) as text_length,
            structure IS NOT NULL as has_structure
     FROM legal_documents WHERE id = $1`,
    [document.id]
  )

  if (verification.rows.length > 0) {
    const v = verification.rows[0]
    console.log('\n📋 Vérification DB:')
    console.log(`   Citation Key: ${v.citation_key}`)
    console.log(`   Status: ${v.consolidation_status}`)
    console.log(`   Pages: ${v.page_count}`)
    console.log(`   Texte: ${v.text_length} chars`)
    console.log(`   Structure: ${v.has_structure ? '✅' : '❌'}`)
  }

  console.log('\n=== Consolidation terminée ===')
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
