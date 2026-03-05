import { query } from '@/lib/db/postgres'
async function main() {
  await query(`UPDATE web_sources SET rag_enabled = true WHERE id = 'd559807e-ce6a-4e39-acce-c42c1409dc1d'`)
  console.log('rag_enabled=true sur المجلات القانونية سارية المفعول')
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
