#!/usr/bin/env npx tsx
/**
 * Test RAG Document-Aware
 *
 * Compare la recherche KB classique vs document-aware
 * pour valider l'enrichissement du contexte juridique.
 *
 * Usage: npx tsx scripts/test-rag-document-aware.ts [--query "votre query"]
 */

import { db } from '@/lib/db/postgres'
import {
  generateEmbedding,
  formatEmbeddingForPostgres,
} from '@/lib/ai/embeddings-service'

const DEFAULT_QUERIES = [
  'الدفاع الشرعي في القانون التونسي',
  'الفصل 39 من المجلة الجزائية',
  'عقوبة السرقة',
  'المسؤولية الجزائية',
]

async function main() {
  const queryArg = process.argv.find(a => a.startsWith('--query='))
  const queries = queryArg
    ? [queryArg.replace('--query=', '')]
    : DEFAULT_QUERIES

  console.log('=== Test RAG Document-Aware ===\n')

  for (const query of queries) {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`📝 Query: ${query}`)
    console.log('═'.repeat(60))

    // Générer embedding de la query
    const embResult = await generateEmbedding(query)
    const embStr = formatEmbeddingForPostgres(embResult.embedding)

    // 1. Recherche classique (KB chunks)
    console.log('\n--- Recherche KB Classique ---')
    const classicResult = await db.query<any>(
      `SELECT
        kbc.knowledge_base_id,
        kb.title,
        LEFT(kbc.content, 200) as content_preview,
        (1 - (kbc.embedding <=> $1::vector))::FLOAT as similarity,
        kbc.metadata
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kb.is_indexed = true
      ORDER BY kbc.embedding <=> $1::vector ASC
      LIMIT 5`,
      [embStr]
    )

    for (const row of classicResult.rows) {
      const sim = (row.similarity * 100).toFixed(1)
      console.log(`  [${sim}%] ${row.title}`)
      console.log(`         ${row.content_preview?.substring(0, 100)}...`)
    }

    // 2. Recherche document-aware
    console.log('\n--- Recherche Document-Aware ---')
    try {
      const docAwareResult = await db.query<any>(
        `SELECT * FROM search_kb_document_aware($1::vector, NULL, false, 5)`,
        [embStr]
      )

      for (const row of docAwareResult.rows) {
        const sim = (row.similarity * 100).toFixed(1)
        const canonical = row.is_canonical ? '📌' : ''
        const abrogated = row.is_abrogated ? '⚠️' : ''
        const article = row.article_number ? `Art.${row.article_number}` : ''

        console.log(`  [${sim}%] ${canonical}${abrogated} ${row.title} ${article}`)
        console.log(`         Citation: ${row.citation_key || 'N/A'}`)
        console.log(`         Type: ${row.document_type || 'N/A'} | Cat: ${row.primary_category || 'N/A'}`)
        console.log(`         ${row.content?.substring(0, 100)}...`)
      }

      if (docAwareResult.rows.length === 0) {
        console.log('  (aucun résultat - la fonction search_kb_document_aware est peut-être pas encore déployée)')
      }
    } catch (err: any) {
      if (err.message.includes('does not exist')) {
        console.log('  ⚠️ Fonction search_kb_document_aware non trouvée - migration pas encore appliquée')
      } else {
        console.error('  ❌ Erreur:', err.message)
      }
    }
  }

  console.log('\n=== Tests terminés ===')
  process.exit(0)
}

main().catch(err => {
  console.error('❌ Erreur:', err)
  process.exit(1)
})
