import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // ID de la source "المجلات القانونية سارية المفعول"
  const srcCodes = await c.query("SELECT id, name FROM web_sources WHERE base_url LIKE '%iort%codes%' OR name LIKE '%مجلات%' OR name LIKE '%codes%'")
  console.log('Sources codes:', srcCodes.rows)

  // Pages indexées pour ces sources
  for (const src of srcCodes.rows) {
    const pagesIndexed = await c.query(`
      SELECT count(wp.id) as total, 
             count(kb.id) as indexed
      FROM web_pages wp 
      LEFT JOIN knowledge_base kb ON kb.source_url = wp.url
      WHERE wp.web_source_id = $1
    `, [src.id])
    console.log(`\n${src.name}: total=${pagesIndexed.rows[0].total}, indexed=${pagesIndexed.rows[0].indexed}`)
  }
  
  // Chercher Constitution et codes dans KB
  console.log('\n--- Codes dans KB ---')
  const codesDocs = await c.query(`
    SELECT title, source_url, category
    FROM knowledge_base
    WHERE title ILIKE '%دستور%' OR title ILIKE '%مجلة الجزائية%' OR title ILIKE '%مجلة التجارية%'
       OR title ILIKE '%الأحوال الشخصية%' OR title ILIKE '%الالتزامات%' OR title ILIKE '%مجلة الشغل%'
    ORDER BY title
    LIMIT 20
  `)
  console.log('Documents codes trouvés:', codesDocs.rows.length)
  codesDocs.rows.forEach(r => console.log(`  - ${r.title} (${r.category})`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
