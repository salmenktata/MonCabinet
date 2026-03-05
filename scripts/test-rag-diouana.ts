import { generateEmbedding, formatEmbeddingForPostgres } from '@/lib/ai/embeddings-service'
import { query } from '@/lib/db/postgres'

async function main() {
  const question = 'ما هو الفصل الأول من مجلة الديوانة'
  const embResult = await generateEmbedding(question)
  console.log('Provider:', embResult.provider, '| dims:', embResult.embedding.length)
  
  const embStr = formatEmbeddingForPostgres(embResult.embedding)
  const col = embResult.provider === 'openai' ? 'embedding_openai' : 'embedding'
  
  const r = await query(`
    SELECT kb.title, kbc.chunk_index,
           (1 - (kbc.${col} <=> $1::vector)) as similarity
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kbc.knowledge_base_id = kb.id
    WHERE kb.title ILIKE '%الديوانة%'
      AND kbc.${col} IS NOT NULL
    ORDER BY kbc.${col} <=> $1::vector
    LIMIT 8
  `, [embStr])
  
  console.log(`\nTop 8 chunks مجلة الديوانة (col: ${col}):`)
  r.rows.forEach(row => console.log(
    ` sim: ${parseFloat(row.similarity).toFixed(3)} | ${row.title?.substring(0,50)} #${row.chunk_index}`
  ))
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
