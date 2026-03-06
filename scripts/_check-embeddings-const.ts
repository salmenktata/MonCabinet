import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  // Embeddings des chunks Constitution
  const constEmbed = await c.query(`
    SELECT kb.title,
           kbc.embedding_openai IS NOT NULL as has_openai,
           kbc.embedding_gemini IS NOT NULL as has_gemini,
           length(kbc.content) as content_len
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.source_file LIKE '%iort.tn/siteiort/codes/دستور%'
    ORDER BY kb.title
  `)
  console.log('Constitution chunks embeddings:')
  constEmbed.rows.forEach(r => console.log(`  ${r.title?.substring(0, 50)} | openai=${r.has_openai} gemini=${r.has_gemini} len=${r.content_len}`))
  
  // Count pages pending COC/Travail/Statut Personnel
  const pendingByCode = await c.query(`
    SELECT 
      CASE 
        WHEN url LIKE '%مجلة-الالتزامات%' THEN 'COC'
        WHEN url LIKE '%مجلة-الشغل/%' THEN 'Code Travail'
        WHEN url LIKE '%الأحوال-الشخصية%' THEN 'Code Statut Personnel'
        WHEN url LIKE '%مجلة-الجزائية%' THEN 'Code Pénal'
        ELSE 'Autre'
      END as code,
      count(*) as cnt
    FROM web_pages
    WHERE web_source_id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
    AND status = 'pending'
    AND extracted_text IS NOT NULL AND LENGTH(extracted_text) >= 50
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 10
  `)
  console.log('\nPages pending par code:')
  pendingByCode.rows.forEach(r => console.log(`  ${r.cnt} pages - ${r.code}`))
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
