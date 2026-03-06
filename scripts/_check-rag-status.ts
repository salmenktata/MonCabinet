import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Status rag_enabled pour docs web scraped (IORT codes)
  const ragStatus = await c.query(`
    SELECT rag_enabled, pipeline_stage, is_indexed, count(*) as cnt
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
       OR source_file LIKE '%iort.tn/siteiort/codes%'
    GROUP BY rag_enabled, pipeline_stage, is_indexed
    ORDER BY cnt DESC
  `)
  console.log('IORT codes - RAG/pipeline status:')
  ragStatus.rows.forEach(r => console.log(`  rag_enabled=${r.rag_enabled} pipeline=${r.pipeline_stage} is_indexed=${r.is_indexed} count=${r.cnt}`))
  
  // Constitution spécifiquement
  const constDocs = await c.query(`
    SELECT title, rag_enabled, pipeline_stage, is_indexed, 
           (SELECT count(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunks
    FROM knowledge_base kb
    WHERE source_file LIKE '%iort.tn/siteiort/codes/دستور%'
    LIMIT 10
  `)
  console.log('\nConstitution docs:')
  constDocs.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 50)} | rag=${r.rag_enabled} stage=${r.pipeline_stage} indexed=${r.is_indexed} chunks=${r.chunks}`))
  
  // Docs avec rag_enabled=true et is_indexed=true
  const ragReady = await c.query(`
    SELECT count(*) FROM knowledge_base 
    WHERE rag_enabled = true AND is_indexed = true
  `)
  console.log('\nTotal docs RAG-ready (rag_enabled=true + is_indexed=true):', ragReady.rows[0].count)
  
  // Docs with embeddings (chunks)
  const withChunks = await c.query(`
    SELECT count(DISTINCT knowledge_base_id) FROM knowledge_base_chunks WHERE embedding_openai IS NOT NULL
  `)
  console.log('Docs with OpenAI embeddings:', withChunks.rows[0].count)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
