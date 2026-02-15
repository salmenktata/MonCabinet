#!/usr/bin/env npx tsx
/**
 * POC - Créer le document juridique "Code Pénal Tunisien"
 *
 * 1. Crée l'entrée legal_documents (citation_key: code-penal-tunisien)
 * 2. Lie toutes les pages web_pages de 9anoun /code-penal/
 * 3. Extrait les numéros d'articles depuis les URLs
 * 4. Calcule page_count et structure hiérarchique
 *
 * Usage: npx tsx scripts/poc-create-code-penal-document.ts
 */

import { db } from '@/lib/db/postgres'
import {
  findOrCreateDocument,
  linkPageToDocument,
  getDocumentWithPages,
  updateConsolidation,
} from '@/lib/legal-documents/document-service'
import {
  extractArticleNumberFromUrl,
  getCodeMetadata,
} from '@/lib/legal-documents/citation-key-extractor'

const SOURCE_ID = '4319d2d1-569c-4107-8f52-d71e2a2e9fe9' // 9anoun.tn

async function main() {
  console.log('=== POC Code Pénal Tunisien - Création Document Juridique ===\n')

  // 1. Créer le document
  const meta = getCodeMetadata('code-penal')
  if (!meta) {
    console.error('❌ Métadonnées code-penal non trouvées dans 9anoun-code-domains')
    process.exit(1)
  }

  console.log(`📋 Métadonnées:`)
  console.log(`   Citation Key: ${meta.citationKey}`)
  console.log(`   Titre AR: ${meta.officialTitleAr}`)
  console.log(`   Titre FR: ${meta.officialTitleFr}`)
  console.log(`   Domaines: ${meta.legalDomains.join(', ')}`)
  console.log()

  const document = await findOrCreateDocument({
    citationKey: meta.citationKey,
    documentType: meta.documentType,
    officialTitleAr: meta.officialTitleAr,
    officialTitleFr: meta.officialTitleFr,
    primaryCategory: meta.primaryCategory,
    secondaryCategories: ['legislation'],
    tags: ['code-penal', 'droit-penal', 'tunisie'],
    legalDomains: meta.legalDomains,
    canonicalSourceId: SOURCE_ID,
    sourceUrls: ['https://9anoun.tn/kb/codes/code-penal'],
  })

  console.log(`✅ Document créé/trouvé: ${document.id}`)
  console.log()

  // 2. Requêter toutes les pages /code-penal/ de 9anoun
  const pagesResult = await db.query<any>(
    `SELECT id, url, title, word_count, extracted_text IS NOT NULL as has_text
     FROM web_pages
     WHERE web_source_id = $1
       AND url LIKE '%/code-penal/%'
       AND status IN ('crawled', 'indexed')
     ORDER BY url ASC`,
    [SOURCE_ID]
  )

  console.log(`📄 Pages trouvées: ${pagesResult.rows.length}`)
  console.log()

  // 3. Lier chaque page avec extraction du numéro d'article
  let linked = 0
  let skipped = 0
  const articleNumbers: string[] = []

  for (const page of pagesResult.rows) {
    const articleNumber = extractArticleNumberFromUrl(page.url)

    if (articleNumber) {
      articleNumbers.push(articleNumber)
    }

    // Déterminer le type de contribution
    const isArticle = articleNumber !== null
    const contributionType = isArticle ? 'article' : 'chapter'

    // Ordre basé sur le numéro d'article (si numérique)
    let pageOrder: number | null = null
    if (articleNumber) {
      const numMatch = articleNumber.match(/^(\d+)/)
      if (numMatch) pageOrder = parseInt(numMatch[1], 10)
    }

    try {
      await linkPageToDocument(
        page.id,
        document.id,
        articleNumber,
        pageOrder,
        contributionType,
        false
      )
      linked++
    } catch (err: any) {
      console.warn(`⚠️ Skip page ${page.url}: ${err.message}`)
      skipped++
    }
  }

  console.log(`🔗 Pages liées: ${linked}`)
  if (skipped > 0) console.log(`⚠️ Pages ignorées: ${skipped}`)
  console.log(`📊 Articles identifiés: ${articleNumbers.length}`)
  console.log()

  // 4. Construire la structure hiérarchique basique
  const structure = buildBasicStructure(articleNumbers)

  // 5. Mettre à jour page_count (pas encore de consolidation texte)
  await db.query(
    `UPDATE legal_documents SET
      page_count = $2,
      structure = $3,
      consolidation_status = 'partial',
      updated_at = NOW()
    WHERE id = $1`,
    [document.id, linked, JSON.stringify(structure)]
  )

  console.log(`📊 Structure:`)
  console.log(`   Pages totales: ${linked}`)
  console.log(`   Articles: ${structure.totalArticles}`)
  console.log(`   Range: ${structure.articleRange?.min} - ${structure.articleRange?.max}`)
  console.log()

  // 6. Vérification finale
  const docWithPages = await getDocumentWithPages(document.id)
  if (docWithPages) {
    console.log(`✅ Vérification:`)
    console.log(`   Document: ${docWithPages.document.citationKey}`)
    console.log(`   Status: ${docWithPages.document.consolidationStatus}`)
    console.log(`   Pages liées: ${docWithPages.pages.length}`)
    console.log(`   Premières pages:`)
    for (const p of docWithPages.pages.slice(0, 5)) {
      console.log(`     - Art. ${p.articleNumber || '?'}: ${p.url}`)
    }
    if (docWithPages.pages.length > 5) {
      console.log(`     ... et ${docWithPages.pages.length - 5} de plus`)
    }
  }

  console.log('\n=== POC terminé avec succès ===')
  process.exit(0)
}

/**
 * Construire une structure hiérarchique basique depuis les numéros d'articles
 */
function buildBasicStructure(articleNumbers: string[]) {
  const numericArticles = articleNumbers
    .map(a => {
      const match = a.match(/^(\d+)/)
      return match ? parseInt(match[1], 10) : null
    })
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)

  const min = numericArticles.length > 0 ? numericArticles[0] : null
  const max = numericArticles.length > 0 ? numericArticles[numericArticles.length - 1] : null

  // Détection basique des "livres" du Code Pénal tunisien
  // Livre 1: Art 1-60 (Dispositions générales)
  // Livre 2: Art 61-... (Infractions)
  const books = [
    {
      number: 1,
      titleAr: 'الكتاب الأول - أحكام عامة',
      titleFr: 'Livre Premier - Dispositions Générales',
      articleRange: { min: 1, max: 60 },
      articleCount: numericArticles.filter(n => n >= 1 && n <= 60).length,
    },
    {
      number: 2,
      titleAr: 'الكتاب الثاني - في مختلف الجرائم',
      titleFr: 'Livre Deuxième - Des Diverses Infractions',
      articleRange: { min: 61, max: max || 999 },
      articleCount: numericArticles.filter(n => n > 60).length,
    },
  ]

  return {
    totalArticles: articleNumbers.length,
    numericArticles: numericArticles.length,
    nonNumericArticles: articleNumbers.filter(a => !a.match(/^\d+$/)),
    articleRange: { min, max },
    books,
  }
}

main().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
