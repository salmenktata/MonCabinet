import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Constitution de la République du 27 janvier 2014 - 52 chunks
  const realConst = await c.query(`
    SELECT kb.title, kb.rag_enabled, kb.pipeline_stage,
           count(kbc.id) as chunks,
           LEFT(MIN(kbc.content), 200) as sample
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title LIKE '%Constitution de la République Tunisienne du 27 janvier%'
    GROUP BY kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage
  `)
  console.log('Constitution 2014 (legislation-securite):')
  realConst.rows.forEach(r => {
    console.log(`  title=${r.title?.substring(0, 60)}`)
    console.log(`  rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks}`)
    console.log(`  sample: ${r.sample?.substring(0, 150)}\n`)
  })
  
  // Constitution 2022 
  const const2022 = await c.query(`
    SELECT kb.title, kb.rag_enabled, kb.pipeline_stage, count(kbc.id) as chunks
    FROM knowledge_base kb
    LEFT JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title LIKE '%Constitution%2022%' OR kb.title LIKE '%25 juillet 2022%'
    GROUP BY kb.id, kb.title, kb.rag_enabled, kb.pipeline_stage
  `)
  console.log('Constitution 2022:')
  const2022.rows.forEach(r => console.log(`  ${r.title?.substring(0, 70)} rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks}`))
  
  // Chercher الفصل الأول من الدستور dans tous les chunks
  const fsl1Chunks = await c.query(`
    SELECT kb.title, LEFT(kbc.content, 300) as content
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.rag_enabled = true
    AND kbc.content ILIKE '%الفصل الأوّل%تونس%دولة%'
    OR kbc.content LIKE '%تونس دولة حرة، مستقلة%'
    LIMIT 5
  `)
  console.log('\nChunks avec الفصل الأول من الدستور:')
  fsl1Chunks.rows.forEach(r => {
    console.log(`  --- ${r.title?.substring(0, 60)} ---`)
    console.log(`  ${r.content?.substring(0, 200)}`)
  })
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
