import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  const codes = [
    { name: 'COC (مجلة الالتزامات والعقود)', pattern: '%الالتزامات%والعقود%' },
    { name: 'Code Pénal (مجلة الجزائية)', pattern: '%مجلة الجزائية%' },
    { name: 'Code Commerce (مجلة التجارية)', pattern: '%مجلة التجارية%' },
    { name: 'Code Travail (مجلة الشغل)', pattern: '%مجلة الشغل%' },
    { name: 'Code Statut Personnel (مجلة الأحوال)', pattern: '%الأحوال الشخصية%' },
    { name: 'Constitution (الفصل الأول)', pattern: '%دستور%الباب الأول%' },
  ]
  
  for (const code of codes) {
    const result = await c.query(`
      SELECT count(*) as total,
             count(*) FILTER (WHERE rag_enabled = true AND is_indexed = true) as rag_ready
      FROM knowledge_base
      WHERE title ILIKE $1 OR source_file ILIKE $1
    `, [code.pattern])
    console.log(`${code.name}: total=${result.rows[0].total}, rag_ready=${result.rows[0].rag_ready}`)
  }
  
  // Check مجلة الشغل spécifiquement
  const travail = await c.query(`
    SELECT title, rag_enabled, pipeline_stage, is_indexed, 
           (SELECT count(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunks
    FROM knowledge_base kb
    WHERE title ILIKE '%مجلة الشغل%' OR source_file ILIKE '%مجلة-الشغل%'
    LIMIT 5
  `)
  console.log('\nCode Travail docs:')
  travail.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 60)} rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks}`))
  
  // Check الباب الأول من الدستور
  const constFirst = await c.query(`
    SELECT title, rag_enabled, pipeline_stage,
           (SELECT count(*) FROM knowledge_base_chunks WHERE knowledge_base_id = kb.id) as chunks
    FROM knowledge_base kb
    WHERE source_file LIKE '%دستور%' AND (title LIKE '%الباب الأول%' OR title LIKE '%الفصل الأول%')
    LIMIT 5
  `)
  console.log('\nConstitution Chapitre 1:')
  constFirst.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 60)} rag=${r.rag_enabled} stage=${r.pipeline_stage} chunks=${r.chunks}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
