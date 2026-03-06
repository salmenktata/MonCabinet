import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Colonnes table knowledge_base
  const cols = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'knowledge_base' ORDER BY ordinal_position LIMIT 15")
  console.log('KB columns:', cols.rows.map(r => r.column_name).join(', '))
  
  // Source codes
  const CODES_SRC_ID = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
  
  // Pages indexées
  const pagesTotal = await c.query("SELECT count(*) FROM web_pages WHERE web_source_id = $1", [CODES_SRC_ID])
  console.log('\nPages crawlées codes:', pagesTotal.rows[0].count)
  
  // Docs dans KB pour cette source
  const urlCol = cols.rows.find(r => r.column_name.includes('url') || r.column_name.includes('source'))
  console.log('URL column candidate:', urlCol?.column_name)
  
  // Chercher docs codes dans KB par title
  const codesDocs = await c.query(`
    SELECT title, category
    FROM knowledge_base
    WHERE title ILIKE '%دستور%' OR title ILIKE '%مجلة جزائية%' OR title ILIKE '%مجلة تجارية%'
       OR title ILIKE '%أحوال شخصية%' OR title ILIKE '%الالتزامات%' OR title ILIKE '%مجلة شغل%'
       OR title ILIKE '%constitution%'
    ORDER BY title
    LIMIT 20
  `)
  console.log('\nDocs codes dans KB:', codesDocs.rows.length)
  codesDocs.rows.forEach(r => console.log(`  - ${r.title}`))
  
  // Total par web source
  const kbPerSource = await c.query(`
    SELECT ws.name, count(kb.id) as kb_count
    FROM web_sources ws
    LEFT JOIN knowledge_base kb ON kb.web_source_id = ws.id
    GROUP BY ws.id, ws.name
    ORDER BY count(kb.id) DESC
    LIMIT 15
  `)
  console.log('\nKB docs par source:')
  kbPerSource.rows.forEach(r => console.log(`  ${r.kb_count} - ${r.name}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
