/**
 * Supprimer les 15 KB entries IORT Constitution corrompues
 * (toutes ont le même contenu = table des matières, pas le texte réel)
 */
import { Pool } from 'pg'

const pool = new Pool({
  host: 'localhost', port: 5434, database: 'qadhya',
  user: 'moncabinet', password: 'prod_secure_password_2026'
})

async function main() {
  const c = await pool.connect()
  
  // Identifier les docs corrompus (même contenu dans les chunks)
  const corrupted = await c.query(`
    SELECT kb.id, kb.title, kb.source_file
    FROM knowledge_base kb
    WHERE kb.source_file LIKE '%iort.tn/siteiort/codes/دستور%'
    ORDER BY kb.title
  `)
  
  console.log(`Docs IORT Constitution à supprimer: ${corrupted.rows.length}`)
  corrupted.rows.forEach(r => console.log(`  - ${r.title?.substring(0, 70)}`))
  
  if (corrupted.rows.length === 0) {
    console.log('Aucun doc à supprimer')
    await pool.end()
    process.exit(0)
  }
  
  const ids = corrupted.rows.map(r => r.id)
  
  // Supprimer les chunks d'abord
  const chunksDeleted = await c.query(
    `DELETE FROM knowledge_base_chunks WHERE knowledge_base_id = ANY($1::uuid[])`,
    [ids]
  )
  console.log(`\n✅ Chunks supprimés: ${chunksDeleted.rowCount}`)
  
  // Supprimer les KB entries
  const kbDeleted = await c.query(
    `DELETE FROM knowledge_base WHERE id = ANY($1::uuid[])`,
    [ids]
  )
  console.log(`✅ KB entries supprimées: ${kbDeleted.rowCount}`)
  
  // Réinitialiser is_indexed sur web_pages pour permettre re-crawl
  const pagesReset = await c.query(
    `UPDATE web_pages SET is_indexed = false
     WHERE url LIKE ANY(SELECT source_file FROM knowledge_base WHERE id = ANY($1::uuid[]))
     OR url LIKE '%iort.tn/siteiort/codes/دستور%'`,
    [ids]
  )
  console.log(`✅ web_pages réinitialisées: ${pagesReset.rowCount}`)
  
  c.release()
  await pool.end()
  process.exit(0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
