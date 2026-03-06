import { Pool } from 'pg'

const pool = new Pool({ host: 'localhost', port: 5434, database: 'qadhya', user: 'moncabinet', password: 'prod_secure_password_2026' })

async function main() {
  const c = await pool.connect()
  
  const codesSourceId = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'
  
  // Pages non indexées de la source codes IORT
  const unindexed = await c.query(`
    SELECT wp.url, wp.title
    FROM web_pages wp
    WHERE wp.web_source_id = $1
    AND NOT EXISTS (
      SELECT 1 FROM knowledge_base kb WHERE kb.source_file = wp.url
    )
    LIMIT 20
  `, [codesSourceId])
  
  console.log('Sample unindexed pages from IORT codes:')
  unindexed.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 60) || 'no title'} | ${r.url?.substring(0, 80)}`))
  
  // Identifier quels codes sont représentés dans ces pages non indexées
  const unindexedCodes = await c.query(`
    SELECT 
      CASE 
        WHEN url LIKE '%مجلة-الالتزامات%' THEN 'COC'
        WHEN url LIKE '%مجلة-الجزائية%' OR url LIKE '%penal%' THEN 'Code Pénal'
        WHEN url LIKE '%مجلة-التجارية%' THEN 'Code Commerce'
        WHEN url LIKE '%مجلة-الشغل%' THEN 'Code Travail'
        WHEN url LIKE '%الأحوال-الشخصية%' THEN 'Code Statut Personnel'
        WHEN url LIKE '%دستور%' THEN 'Constitution'
        ELSE 'Autre: ' || split_part(url, '/codes/', 2)
      END as code_name,
      count(*) as cnt
    FROM web_pages
    WHERE web_source_id = $1
    AND NOT EXISTS (SELECT 1 FROM knowledge_base kb WHERE kb.source_file = url)
    GROUP BY 1
    ORDER BY cnt DESC
  `, [codesSourceId])
  
  console.log('\nPages non indexées par code:')
  unindexedCodes.rows.forEach(r => console.log(`  ${r.cnt} pages - ${r.code_name}`))
  
  // Check why RAG fails - look at actual chunk content for Constitution ch1
  const constCh1 = await c.query(`
    SELECT kb.title, kbc.content
    FROM knowledge_base kb
    JOIN knowledge_base_chunks kbc ON kbc.knowledge_base_id = kb.id
    WHERE kb.title LIKE '%الباب الأوّل%' AND kb.source_file LIKE '%دستور%'
    LIMIT 1
  `)
  if (constCh1.rows.length > 0) {
    console.log('\nConstitution Baab 1 chunk:')
    console.log(constCh1.rows[0].content?.substring(0, 300))
  }
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
