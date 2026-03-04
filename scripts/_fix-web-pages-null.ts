import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  console.log('=== Fix web_pages indexed sans knowledge_base_id ===\n')

  // 1. Pages vides / < 200 chars → reset is_indexed=false
  // Ces pages ont été marquées indexed par erreur (contenu trop court)
  const fix1 = await pool.query(`
    UPDATE web_pages
    SET is_indexed = false, updated_at = NOW()
    WHERE is_indexed = true
      AND knowledge_base_id IS NULL
      AND (extracted_text IS NULL OR LENGTH(extracted_text) < 200)
    RETURNING id`)
  console.log(`Pages vides/< 200 chars reset → is_indexed=false : ${fix1.rowCount}`)

  // 2. Pages avec contenu >= 1000 chars sans KB entry, hors 9anoun.tn et iort
  // (9anoun et iort = pipeline consolidation, knowledge_base_id NULL = attendu)
  const fix2 = await pool.query(`
    UPDATE web_pages wp
    SET is_indexed = false, updated_at = NOW()
    FROM web_sources ws
    WHERE wp.web_source_id = ws.id
      AND wp.is_indexed = true
      AND wp.knowledge_base_id IS NULL
      AND LENGTH(wp.extracted_text) >= 1000
      AND ws.base_url NOT ILIKE '%9anoun.tn%'
      AND ws.base_url NOT ILIKE '%iort.gov.tn%'
    RETURNING wp.id, ws.base_url, LENGTH(wp.extracted_text) as len`)
  console.log(`\nPages >= 1000 chars (hors consolidation) reset : ${fix2.rowCount}`)
  for (const r of fix2.rows)
    console.log(`  ${r.len} chars — ${r.base_url}`)

  // 3. Vérification finale
  const after = await pool.query(`
    SELECT ws.base_url, COUNT(*) n
    FROM web_pages wp
    JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE wp.is_indexed = true AND wp.knowledge_base_id IS NULL
    GROUP BY ws.base_url ORDER BY n DESC`)
  console.log('\n=== État après correction ===')
  for (const r of after.rows)
    console.log(`  ${r.n.toString().padStart(5)}  ${r.base_url}`)

  const total = await pool.query(`
    SELECT COUNT(*) FROM web_pages WHERE is_indexed=true AND knowledge_base_id IS NULL`)
  console.log(`\nTotal restants (consolidation pipeline, attendu) : ${total.rows[0].count}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
