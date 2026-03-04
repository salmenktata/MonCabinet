import { Pool } from 'pg'

const pool = new Pool({ 
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3 
})

const OFFSET = parseInt(process.env.OFFSET || '0', 10)

async function main() {
  const r = await pool.query(`
    SELECT kb.id, kb.title, kb.subcategory,
      COALESCE((
        SELECT string_agg(kbc.content, ' ')
        FROM (SELECT kbc.content FROM knowledge_base_chunks kbc WHERE kbc.knowledge_base_id=kb.id ORDER BY kbc.chunk_index LIMIT 2) kbc
      ), '') as content
    FROM knowledge_base kb
    WHERE kb.category='google_drive' AND kb.is_active=true 
    ORDER BY kb.created_at DESC OFFSET $1 LIMIT 30
  `, [OFFSET])
  
  for (const row of r.rows) {
    console.log(`ID: ${row.id}`)
    console.log(`TITLE: ${row.title}`)
    console.log(`SUBCATEGORY: ${row.subcategory || 'null'}`)
    console.log(`EXCERPT: ${(row.content || '').substring(0,300).replace(/\n/g,' ')}`)
    console.log('---')
  }
  
  await pool.end()
}

main().catch(console.error)
