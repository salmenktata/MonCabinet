import { db } from '@/lib/db/postgres'

async function main() {
  const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'web_pages' ORDER BY ordinal_position LIMIT 10")
  console.log('web_pages columns:', cols.rows.map(r => r.column_name).join(', '))

  const src = await db.query("SELECT id, name FROM web_sources WHERE id = '26b1b332-58e1-445f-a7fd-324e3814a712'")
  console.log('Source 9anoun:', src.rows)

  const pagesCol = cols.rows.find(r => ['web_source_id', 'source_id'].includes(r.column_name))
  if (pagesCol) {
    const cnt = await db.query(`SELECT count(*) FROM web_pages WHERE ${pagesCol.column_name} = '26b1b332-58e1-445f-a7fd-324e3814a712'`)
    console.log('Pages count:', cnt.rows[0].count)
  }
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
