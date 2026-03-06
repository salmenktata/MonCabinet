import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Contenu des 3 premiers chapitres Constitution
  const chunks = await c.query(`
    SELECT kb.title, LEFT(kbc.content, 200) as content_start
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.source_file LIKE '%iort.tn/siteiort/codes/دستور%'
    ORDER BY kb.title
    LIMIT 4
  `)
  console.log('Constitution chunk content samples:')
  chunks.rows.forEach(r => {
    console.log(`\n--- ${r.title} ---`)
    console.log(r.content_start)
  })
  
  // Vérifier si les contenus sont identiques
  const dupCheck = await c.query(`
    SELECT count(DISTINCT content) as unique_contents, count(*) as total
    FROM knowledge_base_chunks kbc
    JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
    WHERE kb.source_file LIKE '%iort.tn/siteiort/codes/دستور%'
  `)
  console.log('\nDistinct contents:', dupCheck.rows[0])
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
