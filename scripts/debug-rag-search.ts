#!/usr/bin/env tsx

/**
 * Script de diagnostic RAG - Tester recherche vectorielle
 *
 * Usage:
 *   npx tsx scripts/debug-rag-search.ts
 */

import { pool } from '../lib/db'
import { generateEmbedding } from '../lib/ai/embeddings-service'

async function debugRAGSearch() {
  console.log('🔍 Diagnostic Recherche RAG\n')

  const testQuery = 'الدفاع الشرعي في حالة القتل' // Légitime défense en cas d'homicide

  try {
    // Étape 1: Vérifier les chunks disponibles
    console.log('📊 Étape 1: Vérification base de données')
    const statsResult = await pool.query(`
      SELECT
        kb.category,
        COUNT(*) as chunks,
        COUNT(DISTINCT kb.id) as documents
      FROM knowledge_base kb
      INNER JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding IS NOT NULL
      GROUP BY kb.category
      ORDER BY chunks DESC
    `)
    console.log('Chunks par catégorie:')
    statsResult.rows.forEach((row) => {
      console.log(`  ${row.category}: ${row.chunks} chunks, ${row.documents} docs`)
    })

    // Étape 2: Générer embedding pour la query
    console.log(`\n🧮 Étape 2: Génération embedding pour "${testQuery}"`)
    const startEmbed = Date.now()
    const queryEmbedding = await generateEmbedding(testQuery)
    const embedTime = Date.now() - startEmbed
    console.log(`✅ Embedding généré en ${embedTime}ms`)
    console.log(`   Dimensions: ${queryEmbedding.length}`)
    console.log(`   Premier élément: ${queryEmbedding[0]}`)

    // Étape 3: Recherche vectorielle manuelle avec différents seuils
    console.log('\n🔎 Étape 3: Recherche vectorielle')

    const thresholds = [0.0, 0.3, 0.5, 0.55, 0.6, 0.7, 0.8]

    for (const threshold of thresholds) {
      const searchResult = await pool.query(
        `
        SELECT
          kb.id,
          kb.title,
          kb.category,
          LEFT(kbc.content, 100) as content_preview,
          1 - (kbc.embedding <=> $1::vector) as similarity
        FROM knowledge_base kb
        INNER JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
        WHERE kbc.embedding IS NOT NULL
          AND 1 - (kbc.embedding <=> $1::vector) >= $2
        ORDER BY kbc.embedding <=> $1::vector
        LIMIT 5
        `,
        [JSON.stringify(queryEmbedding), threshold]
      )

      console.log(`\n  Seuil ${threshold}: ${searchResult.rows.length} résultats`)
      if (searchResult.rows.length > 0) {
        searchResult.rows.forEach((row, idx) => {
          console.log(`    ${idx + 1}. ${row.title} (${row.category})`)
          console.log(`       Similarité: ${(row.similarity as number).toFixed(4)}`)
          console.log(`       Contenu: ${row.content_preview}...`)
        })
      }
    }

    // Étape 4: Top 10 documents sans seuil
    console.log('\n📈 Étape 4: Top 10 documents (tous seuils)')
    const topDocsResult = await pool.query(
      `
      SELECT
        kb.title,
        kb.category,
        1 - (kbc.embedding <=> $1::vector) as similarity,
        LEFT(kbc.content, 80) as preview
      FROM knowledge_base kb
      INNER JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding IS NOT NULL
      ORDER BY kbc.embedding <=> $1::vector
      LIMIT 10
      `,
      [JSON.stringify(queryEmbedding)]
    )

    topDocsResult.rows.forEach((row, idx) => {
      console.log(
        `${idx + 1}. [${(row.similarity as number).toFixed(4)}] ${row.title} (${row.category})`
      )
      console.log(`   ${row.preview}...`)
    })

    // Étape 5: Test avec configuration actuelle
    console.log('\n⚙️  Étape 5: Configuration actuelle')
    const aiConfig = await import('../lib/ai/config')
    console.log(`  Seuil RAG: ${aiConfig.default.rag.similarityThreshold}`)
    console.log(
      `  Seuil effectif KB: ${aiConfig.default.rag.similarityThreshold - 0.05} (seuil - 0.05)`
    )

    // Étape 6: Recherche avec seuil effectif
    const effectiveThreshold = aiConfig.default.rag.similarityThreshold - 0.05
    console.log(`\n🎯 Étape 6: Recherche avec seuil effectif (${effectiveThreshold})`)

    const finalResult = await pool.query(
      `
      SELECT COUNT(*) as total
      FROM knowledge_base kb
      INNER JOIN knowledge_base_chunks kbc ON kb.id = kbc.knowledge_base_id
      WHERE kbc.embedding IS NOT NULL
        AND 1 - (kbc.embedding <=> $1::vector) >= $2
      `,
      [JSON.stringify(queryEmbedding), effectiveThreshold]
    )

    console.log(`  Résultats trouvés: ${finalResult.rows[0].total}`)

    if (finalResult.rows[0].total === 0) {
      console.log('\n❌ PROBLÈME IDENTIFIÉ: 0 résultats avec le seuil actuel')
      console.log('   Solutions possibles:')
      console.log('   1. Réduire le seuil de similarité')
      console.log('   2. Régénérer les embeddings avec le même modèle')
      console.log('   3. Vérifier que Ollama utilise le bon modèle pour embeddings')
    } else {
      console.log('\n✅ La recherche fonctionne avec le seuil actuel')
    }
  } catch (error) {
    console.error('❌ Erreur:', error)
    throw error
  } finally {
    await pool.end()
  }
}

debugRAGSearch().catch(console.error)
