import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Tous les docs Constitution IORT
  const allConst = await c.query(`
    SELECT title, source_file, rag_enabled, pipeline_stage,
           (SELECT count(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunks
    FROM knowledge_base kb
    WHERE source_file LIKE '%iort%دستور%' OR source_file LIKE '%constitution%'
    ORDER BY title
  `)
  console.log('Constitution docs from IORT:', allConst.rows.length)
  allConst.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 70)} | rag=${r.rag_enabled} chunks=${r.chunks}`))
  
  // Check الباب الأول
  console.log('\n--- Searching for الباب الأول ---')
  const bab1 = await c.query(`
    SELECT title, source_file FROM knowledge_base
    WHERE title LIKE '%الباب الأول%' AND (source_file LIKE '%دستور%' OR source_file LIKE '%constitution%')
    LIMIT 5
  `)
  console.log('Results:', bab1.rows)
  
  // الفصل الأول من الدستور - chercher dans les chunks
  const fsl1 = await c.query(`
    SELECT kb.title, kbc.content
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE (kb.source_file LIKE '%دستور%' OR kb.title LIKE '%دستور%')
    AND kbc.content LIKE '%الفصل الأول%'
    LIMIT 3
  `)
  console.log('\nChunks avec الفصل الأول:', fsl1.rows.length)
  fsl1.rows.forEach(r => console.log(`  - ${r.title}: ${r.content?.substring(0, 100)}`))
  
  // Check COC - الأهلية
  const coc = await c.query(`
    SELECT kbc.content FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.title ILIKE '%الالتزامات%'
    AND (kbc.content LIKE '%أهلية%' OR kbc.content LIKE '%الفصل 2%' OR kbc.content LIKE '%الفصل الثاني%')
    LIMIT 3
  `)
  console.log('\nCOC chunks avec أهلية:', coc.rows.length)
  coc.rows.forEach(r => console.log(`  - ${r.content?.substring(0, 100)}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
