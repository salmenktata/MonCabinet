import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const r = await pool.query(`SELECT id, LEFT(title,80) as title, category FROM knowledge_base WHERE title LIKE '%50%2018%' LIMIT 10`)
  console.log(r.rows)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
