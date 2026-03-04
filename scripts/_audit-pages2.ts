import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // 1. Colonnes de web_sources
  const cols = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'web_sources' ORDER BY ordinal_position`)
  console.log('=== web_sources columns ===')
  for (const r of cols.rows) console.log(`  ${r.column_name}: ${r.data_type}`)

  // 2. Les 415 IORT docs avec catégorie 'autre' — quels types ?
  const iortAutre = await pool.query(`
    SELECT
      subcategory,
      LEFT(title, 70) as title,
      norm_level
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre'
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 20`)
  console.log('\n=== IORT "autre" docs (sample 20) ===')
  for (const r of iortAutre.rows)
    console.log(`  [${r.subcategory||'null'}] [${r.norm_level||'null'}] ${r.title}`)

  // 3. Distribution des titres IORT autre
  const iortSubcat = await pool.query(`
    SELECT subcategory, COUNT(*) as n
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre'
      AND is_active = true
    GROUP BY subcategory ORDER BY n DESC`)
  console.log('\n=== IORT autre : subcategories ===')
  for (const r of iortSubcat.rows)
    console.log(`  ${(r.subcategory||'null').padEnd(30)} : ${r.n}`)

  // 4. web_pages table : distribution générale
  const wpCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'web_pages' ORDER BY ordinal_position`)
  console.log('\n=== web_pages columns ===')
  for (const r of wpCols.rows) process.stdout.write(r.column_name + ' ')
  console.log()

  // 5. Résumé web_pages
  const wpSummary = await pool.query(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_indexed THEN 1 ELSE 0 END) as indexed,
      SUM(CASE WHEN rag_enabled THEN 1 ELSE 0 END) as rag_enabled,
      SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active
    FROM web_pages`)
  const s = wpSummary.rows[0]
  console.log(`\nweb_pages: total=${s.total} active=${s.active} indexed=${s.indexed} rag_enabled=${s.rag_enabled}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
