import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // المطبعة الرسمية - status complet
  const matba3a = await c.query(`
    SELECT id, title, is_indexed, rag_enabled, pipeline_stage,
           length(full_text) as full_text_len,
           chunk_count,
           source_file
    FROM knowledge_base
    WHERE title LIKE '%المطبعة الرسمية%'
  `)
  console.log('المطبعة الرسمية docs:')
  matba3a.rows.forEach(r => console.log(JSON.stringify(r, null, 2)))
  
  // Docs is_indexed=false et rag_enabled=true (cibles pour indexPendingDocuments)
  const pending = await c.query(`
    SELECT count(*) FROM knowledge_base WHERE is_indexed = false AND full_text IS NOT NULL
  `)
  console.log('\nDocs is_indexed=false avec full_text:', pending.rows[0].count)
  
  // Chunks sans embedding_openai mais avec knowledge_base rag_active
  const chunksNoEmbed = await c.query(`
    SELECT count(*) 
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kbc.embedding_openai IS NULL
    AND kb.rag_enabled = true
    AND kb.is_indexed = true
  `)
  console.log('Chunks sans embedding_openai (rag_active):', chunksNoEmbed.rows[0].count)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
