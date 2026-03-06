import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_base' ORDER BY ordinal_position")
  console.log('ALL knowledge_base columns:', cols.rows.map(r => r.column_name).join(', '))
  
  const chunkCols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_base_chunks' ORDER BY ordinal_position LIMIT 10")
  console.log('\nknowledge_base_chunks columns:', chunkCols.rows.map(r => r.column_name).join(', '))
  
  // Check si rag_enabled existe
  const hasRag = cols.rows.some(r => r.column_name === 'rag_enabled')
  const hasPipeline = cols.rows.some(r => r.column_name === 'pipeline_stage')
  console.log('\nHas rag_enabled:', hasRag)
  console.log('Has pipeline_stage:', hasPipeline)
  
  // Sample KB entries from web scraper
  const webScraped = await c.query(`SELECT title, source_file, metadata->>'source' as source FROM knowledge_base WHERE metadata->>'source' = 'web_scraper' LIMIT 5`)
  console.log('\nSample web scraped KB entries:', webScraped.rows.length)
  webScraped.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 60)} | ${r.source_file?.substring(0, 60)}`))
  
  // Count web scraped
  const wsCnt = await c.query("SELECT count(*) FROM knowledge_base WHERE metadata->>'source' = 'web_scraper'")
  console.log('\nTotal web scraped in KB:', wsCnt.rows[0].count)
  
  // Pages IORT codes non encore indexées
  const codesSourceId = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
  const unindexedPages = await c.query(`
    SELECT count(wp.id) as unindexed
    FROM web_pages wp
    WHERE wp.web_source_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM knowledge_base kb 
      WHERE kb.source_file = wp.url
    )
  `, [codesSourceId])
  console.log('\nPages codes non indexées:', unindexedPages.rows[0].unindexed)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
