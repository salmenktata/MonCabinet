import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const [nullDocType, nullNormLevel, byCategory] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE doc_type IS NULL AND is_active = true`),
    pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE norm_level IS NULL AND doc_type = 'TEXTES' AND is_active = true`),
    pool.query(`SELECT category, COUNT(*) as n FROM knowledge_base WHERE doc_type IS NULL AND is_active = true GROUP BY category ORDER BY n DESC LIMIT 15`),
  ])
  console.log('=== AUDIT KB ===')
  console.log('doc_type IS NULL    :', nullDocType.rows[0].count)
  console.log('norm_level IS NULL (TEXTES):', nullNormLevel.rows[0].count)
  console.log('\nDoc type NULL par catégorie:')
  for (const r of byCategory.rows) console.log(`  ${r.category.padEnd(20)} : ${r.n}`)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
