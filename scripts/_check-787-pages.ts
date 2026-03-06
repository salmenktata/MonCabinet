import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Stats des 787 pages non dans KB
  const stats = await c.query(`
    SELECT 
      status,
      is_indexed,
      CASE WHEN extracted_text IS NULL THEN 'null' 
           WHEN LENGTH(extracted_text) < 50 THEN 'too_short'
           ELSE 'ok' END as text_status,
      count(*) as cnt
    FROM web_pages
    WHERE web_source_id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
    AND NOT EXISTS (SELECT 1 FROM knowledge_base kb WHERE kb.source_file = web_pages.url)
    GROUP BY status, is_indexed, text_status
    ORDER BY cnt DESC
  `)
  console.log('Stats des 787 pages non dans KB:')
  stats.rows.forEach(r => console.log(`  status=${r.status} is_indexed=${r.is_indexed} text=${r.text_status} count=${r.cnt}`))
  
  // Sample pages with short text
  const shortText = await c.query(`
    SELECT url, title, length(extracted_text) as text_len, status, is_indexed
    FROM web_pages
    WHERE web_source_id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
    AND NOT EXISTS (SELECT 1 FROM knowledge_base kb WHERE kb.source_file = url)
    AND extracted_text IS NOT NULL
    ORDER BY text_len DESC
    LIMIT 10
  `)
  console.log('\nSample non-indexed pages (highest text):')
  shortText.rows.forEach(r => console.log(`  text_len=${r.text_len} status=${r.status} is_indexed=${r.is_indexed} | ${r.title?.substring(0, 50)}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
