import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Source 9anoun
  const src = await c.query("SELECT id, name, base_url FROM web_sources WHERE id = '26b1b332-58e1-445f-a7fd-324e3814a712'")
  console.log('Source 9anoun:', src.rows)
  
  // Toutes les sources web
  const allSrc = await c.query("SELECT id, name, base_url FROM web_sources ORDER BY created_at DESC LIMIT 10")
  console.log('\nTop 10 sources:')
  allSrc.rows.forEach(r => console.log(`  - ${r.name}: ${r.base_url}`))
  
  // Count pages par source
  const pages = await c.query("SELECT ws.name, count(wp.id) as pages FROM web_sources ws LEFT JOIN web_pages wp ON wp.web_source_id = ws.id GROUP BY ws.id, ws.name ORDER BY count(wp.id) DESC LIMIT 10")
  console.log('\nPages par source:')
  pages.rows.forEach(r => console.log(`  - ${r.name}: ${r.pages} pages`))
  
  // Count KB documents
  const kb = await c.query("SELECT count(*) FROM knowledge_base")
  console.log('\nTotal KB docs:', kb.rows[0].count)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
