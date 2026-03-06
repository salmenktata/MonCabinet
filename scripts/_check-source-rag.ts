import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Source IORT codes rag_enabled
  const src = await c.query(`
    SELECT id, name, base_url, rag_enabled 
    FROM web_sources 
    WHERE id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
  `)
  console.log('IORT codes source:', src.rows[0])
  
  // Pages non indexées - count avec critères du service
  const eligible = await c.query(`
    SELECT count(*) FROM web_pages
    WHERE web_source_id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
    AND status IN ('crawled', 'unchanged')
    AND extracted_text IS NOT NULL 
    AND LENGTH(extracted_text) >= 50
    AND is_indexed = false
  `)
  console.log('Pages éligibles à indexer:', eligible.rows[0].count)
  
  // Check rag_enabled for newly created KB docs
  const newDocs = await c.query(`
    SELECT rag_enabled, pipeline_stage, count(*) as cnt
    FROM knowledge_base
    WHERE metadata->>'sourceName' = ' المجلات القانونية سارية المفعول'
    GROUP BY rag_enabled, pipeline_stage
    ORDER BY cnt DESC
  `)
  console.log('\nKB docs de cette source (par rag/pipeline):')
  newDocs.rows.forEach(r => console.log(`  rag=${r.rag_enabled} stage=${r.pipeline_stage} count=${r.cnt}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
