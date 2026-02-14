/**
 * Test recherche KB avec question simple sur le divorce
 */

import { db } from '@/lib/db/postgres'
import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'

async function testSimpleSearch() {
  console.log('\n🔍 TEST RECHERCHE KB - Question Simple\n')

  // Question simple et courante
  const question = 'ما هي شروط الطلاق في تونس؟'
  console.log(`📝 Question : ${question}`)

  // 1. Générer embedding
  console.log('\n⏳ Génération embedding...')
  const embeddingResult = await generateEmbedding(question, {
    operationName: 'assistant-ia',
    useOpenAI: true, // Utiliser OpenAI (1536-dim)
  })

  if (!embeddingResult.success || !embeddingResult.embedding) {
    console.error('❌ Échec génération embedding:', embeddingResult.error)
    return
  }

  console.log(`✅ Embedding généré (${embeddingResult.embedding.length} dimensions)`)
  console.log(`   Provider: ${embeddingResult.provider}`)
  console.log(`   Temps: ${embeddingResult.duration}ms`)

  // 2. Formatter pour PostgreSQL
  const embeddingStr = formatEmbeddingForPostgres(embeddingResult.embedding)

  // 3. Test recherche vectorielle simple (pas hybrid)
  console.log('\n🔎 Test recherche vectorielle pure...')
  const vectorResults = await db.query(`
    SELECT
      kb.title,
      kb.category::text,
      kbc.chunk_index,
      LEFT(kbc.content, 100) as preview,
      1 - (kbc.embedding_openai <=> $1::vector(1536)) as similarity
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kbc.embedding_openai IS NOT NULL
      AND kb.is_active = true
      AND 1 - (kbc.embedding_openai <=> $1::vector(1536)) >= 0.5
    ORDER BY kbc.embedding_openai <=> $1::vector(1536)
    LIMIT 5
  `, [embeddingStr])

  console.log(`\n📊 Résultats recherche vectorielle : ${vectorResults.rows.length}`)

  if (vectorResults.rows.length === 0) {
    console.log('\n⚠️  AUCUN résultat trouvé avec seuil 0.5')
    console.log('   Testons avec seuil plus bas (0.3)...')

    const lowThresholdResults = await db.query(`
      SELECT
        kb.title,
        kb.category::text,
        LEFT(kbc.content, 100) as preview,
        1 - (kbc.embedding_openai <=> $1::vector(1536)) as similarity
      FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
      WHERE kbc.embedding_openai IS NOT NULL
        AND kb.is_active = true
        AND 1 - (kbc.embedding_openai <=> $1::vector(1536)) >= 0.3
      ORDER BY kbc.embedding_openai <=> $1::vector(1536)
      LIMIT 5
    `, [embeddingStr])

    console.log(`   Résultats seuil 0.3 : ${lowThresholdResults.rows.length}\n`)

    lowThresholdResults.rows.forEach((row, i) => {
      console.log(`   ${i+1}. ${row.title} (${row.category})`)
      console.log(`      Similarité: ${(row.similarity * 100).toFixed(1)}%`)
      console.log(`      Preview: ${row.preview}...\n`)
    })

  } else {
    vectorResults.rows.forEach((row, i) => {
      console.log(`\n   ${i+1}. ${row.title} (${row.category})`)
      console.log(`      Chunk: ${row.chunk_index}`)
      console.log(`      Similarité: ${(row.similarity * 100).toFixed(1)}%`)
      console.log(`      Preview: ${row.preview}...`)
    })
  }

  // 4. Vérifier combien de chunks ont des embeddings OpenAI
  console.log('\n📈 Statistiques Embeddings KB...')
  const statsResults = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) as with_openai,
      COUNT(*) FILTER (WHERE kbc.embedding IS NOT NULL) as with_ollama,
      COUNT(*) as total
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.is_active = true
  `)

  const stats = statsResults.rows[0]
  console.log(`   Total chunks: ${stats.total}`)
  console.log(`   Avec OpenAI embedding: ${stats.with_openai} (${(stats.with_openai/stats.total*100).toFixed(1)}%)`)
  console.log(`   Avec Ollama embedding: ${stats.with_ollama} (${(stats.with_ollama/stats.total*100).toFixed(1)}%)`)

  // 5. Test recherche hybrid
  console.log('\n🔥 Test recherche HYBRID (vectoriel + BM25)...')
  const hybridResults = await db.query(`
    SELECT * FROM search_knowledge_base_hybrid(
      $1::text,           -- query_text
      $2::vector(1536),   -- query_embedding
      NULL,               -- category_filter
      5,                  -- limit_count
      0.5,                -- vector_threshold
      true,               -- use_openai
      60                  -- rrf_k
    )
  `, [question, embeddingStr])

  console.log(`   Résultats hybrid: ${hybridResults.rows.length}`)

  if (hybridResults.rows.length === 0) {
    console.log('   ⚠️  Recherche hybrid retourne 0 résultats')
  } else {
    hybridResults.rows.forEach((row, i) => {
      console.log(`\n   ${i+1}. ${row.title} (${row.category})`)
      console.log(`      Similarité vectorielle: ${(row.similarity * 100).toFixed(1)}%`)
      console.log(`      BM25 rank: ${row.bm25_rank?.toFixed(2) || 'N/A'}`)
      console.log(`      Hybrid score: ${row.hybrid_score.toFixed(4)}`)
    })
  }

  console.log('\n✅ Test terminé\n')
  process.exit(0)
}

testSimpleSearch().catch((error) => {
  console.error('\n❌ Erreur:', error)
  process.exit(1)
})
