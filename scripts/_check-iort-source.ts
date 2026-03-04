import 'dotenv/config'
import { db } from '../lib/db/postgres'

async function main() {
  const cols = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'web_sources' AND table_schema = 'public'
    ORDER BY ordinal_position
  `)
  console.log('Colonnes:', cols.rows.map((r: any) => r.column_name).join(', '))
  
  const existing = await db.query("SELECT id, name, base_url FROM web_sources WHERE base_url ILIKE '%iort%'")
  console.log('Sources IORT:', JSON.stringify(existing.rows))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
