import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const [dist, nullNorm, sources] = await Promise.all([
    pool.query(`SELECT category, doc_type, COUNT(*) as n FROM knowledge_base WHERE is_active=true GROUP BY category, doc_type ORDER BY category, n DESC`),
    pool.query(`SELECT id, title, category, subcategory FROM knowledge_base WHERE norm_level IS NULL AND doc_type='TEXTES' AND is_active=true LIMIT 10`),
    pool.query(`SELECT metadata->>'sourceOrigin' as origin, COUNT(*) as n FROM knowledge_base WHERE is_active=true GROUP BY origin ORDER BY n DESC LIMIT 10`),
  ])
  console.log('=== Distribution catégorie/doc_type ===')
  for (const r of dist.rows) console.log(`  ${r.category.padEnd(20)} | ${(r.doc_type||'NULL').padEnd(10)} | ${r.n}`)
  console.log('\n=== TEXTES sans norm_level ===')
  for (const r of nullNorm.rows) console.log(`  ${r.category.padEnd(15)} ${r.subcategory||'null'} | ${(r.title||'').substring(0,60)}`)
  console.log('\n=== Par sourceOrigin ===')
  for (const r of sources.rows) console.log(`  ${(r.origin||'null').padEnd(20)} : ${r.n}`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
