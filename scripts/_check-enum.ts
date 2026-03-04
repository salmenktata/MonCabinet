import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })
async function main() {
  const r = await pool.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid = 'norm_level'::regtype ORDER BY enumsortorder`)
  console.log('norm_level ENUM values:')
  for (const row of r.rows) console.log(' ', row.enumlabel)
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
