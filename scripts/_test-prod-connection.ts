import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost',
  port: 5434,
  database: 'qadhya',
  user: 'moncabinet',
  password: 'prod_secure_password_2026',
  connectionTimeoutMillis: 10000,
  ssl: false,
})

async function main() {
  const client = await pool.connect()
  const r = await client.query("SELECT count(*) FROM web_pages WHERE web_source_id = '26b1b332-58e1-445f-a7fd-324e3814a712'")
  console.log('Pages count:', r.rows[0].count)
  client.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error('Error:', e.message); process.exit(1) })
