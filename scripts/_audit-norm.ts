import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const [normDist, textesByNorm, chunksSync] = await Promise.all([
    pool.query(`
      SELECT norm_level, COUNT(*) as n
      FROM knowledge_base WHERE is_active=true AND doc_type='TEXTES'
      GROUP BY norm_level ORDER BY n DESC`),
    pool.query(`
      SELECT category, subcategory, norm_level, COUNT(*) as n
      FROM knowledge_base WHERE is_active=true AND doc_type='TEXTES'
      GROUP BY category, subcategory, norm_level ORDER BY category, n DESC LIMIT 30`),
    pool.query(`
      SELECT COUNT(*) as n FROM knowledge_base_chunks kbc
      JOIN knowledge_base kb ON kb.id = kbc.knowledge_base_id
      WHERE kb.is_active=true
        AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text`),
  ])

  console.log('=== norm_level distribution (TEXTES) ===')
  for (const r of normDist.rows)
    console.log(`  ${(r.norm_level||'NULL').padEnd(25)} : ${r.n}`)

  console.log('\n=== TEXTES par catégorie/subcategory/norm_level ===')
  for (const r of textesByNorm.rows)
    console.log(`  ${r.category.padEnd(15)} | ${(r.subcategory||'null').padEnd(25)} | ${(r.norm_level||'NULL').padEnd(25)} : ${r.n}`)

  console.log('\n=== Chunks avec doc_type désynchronisé ===')
  console.log(`  ${chunksSync.rows[0].n} chunks à corriger`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
