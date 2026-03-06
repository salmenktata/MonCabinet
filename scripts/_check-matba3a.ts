import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // المطبعة الرسمية
  const matba3a = await c.query(`
    SELECT kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage, kb.source_file,
           count(kbc.id) as chunks,
           kbc.embedding_openai IS NOT NULL as has_embedding
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title LIKE '%المطبعة الرسمية%'
    GROUP BY kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage, kb.source_file, kbc.embedding_openai
    LIMIT 5
  `)
  console.log('المطبعة الرسمية:')
  matba3a.rows.forEach(r => console.log(`  rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks} embed=${r.has_embedding} | ${r.source_file?.substring(0,60)}`))
  
  // Constitution 2022 stage=indexed
  const const2022 = await c.query(`
    SELECT kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage, 
           count(kbc.id) as chunks,
           count(*) FILTER (WHERE kbc.embedding_openai IS NOT NULL) as with_embed
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title LIKE '%La Constitution de la République tunisienne du 25 juillet 2022%'
    GROUP BY kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage
  `)
  console.log('\nConstitution 2022:')
  const2022.rows.forEach(r => console.log(`  rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks} with_embed=${r.with_embed}`))
  
  // Check مجلة الشغل pages pending - specifically الفصل الأول
  const travailPending = await c.query(`
    SELECT title, url, length(extracted_text) as text_len
    FROM web_pages
    WHERE web_source_id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
    AND status = 'pending'
    AND url LIKE '%مجلة-الشغل/%'
    ORDER BY text_len DESC
    LIMIT 10
  `)
  console.log('\nمجلة الشغل pending pages:')
  travailPending.rows.forEach(r => console.log(`  len=${r.text_len} | ${r.title?.substring(0, 60)}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
