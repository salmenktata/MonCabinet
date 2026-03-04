import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const remaining = await pool.query(`SELECT COUNT(*) FROM knowledge_base WHERE category = 'google_drive' AND is_active = true`)
  console.log('Docs google_drive restants:', remaining.rows[0].count)

  const dist = await pool.query(`
    SELECT category, COUNT(*) as n
    FROM knowledge_base
    WHERE metadata->>'old_category' = 'google_drive' AND is_active = true
    GROUP BY category ORDER BY n DESC`)
  console.log('\nDistribution reclassifiée:')
  for (const r of dist.rows) console.log(`  ${r.category.padEnd(20)} : ${r.n}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
