import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // Distribution par source
  const bySrc = await pool.query(`
    SELECT ws.base_url, COUNT(*) n
    FROM web_pages wp
    JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE wp.is_indexed = true AND wp.knowledge_base_id IS NULL
    GROUP BY ws.base_url ORDER BY n DESC`)
  console.log('=== web_pages indexed sans KB — par source ===')
  for (const r of bySrc.rows)
    console.log(`  ${r.n.toString().padStart(5)}  ${r.base_url}`)

  // Distribution par taille de texte
  const bySize = await pool.query(`
    SELECT
      CASE
        WHEN extracted_text IS NULL OR LENGTH(extracted_text) = 0 THEN 'vide'
        WHEN LENGTH(extracted_text) < 200   THEN '< 200 chars'
        WHEN LENGTH(extracted_text) < 1000  THEN '200-1000'
        WHEN LENGTH(extracted_text) < 5000  THEN '1000-5000'
        ELSE '>= 5000'
      END as size_bucket,
      COUNT(*) n
    FROM web_pages
    WHERE is_indexed = true AND knowledge_base_id IS NULL
    GROUP BY 1 ORDER BY n DESC`)
  console.log('\n=== Distribution taille texte ===')
  for (const r of bySize.rows)
    console.log(`  ${r.size_bucket.padEnd(15)} : ${r.n}`)

  // Quelques exemples de pages avec du contenu substantiel
  const samples = await pool.query(`
    SELECT wp.url, LENGTH(wp.extracted_text) as len, ws.base_url
    FROM web_pages wp
    JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE wp.is_indexed = true AND wp.knowledge_base_id IS NULL
      AND LENGTH(wp.extracted_text) >= 1000
    ORDER BY LENGTH(wp.extracted_text) DESC
    LIMIT 10`)
  console.log('\n=== Exemples avec contenu substantiel (>= 1000 chars) ===')
  for (const r of samples.rows)
    console.log(`  ${r.len} chars — ${r.url}`)

  // Pages vides ou trop courtes (candidats reset is_indexed=false)
  const tooShort = await pool.query(`
    SELECT COUNT(*) n FROM web_pages
    WHERE is_indexed = true AND knowledge_base_id IS NULL
      AND (extracted_text IS NULL OR LENGTH(extracted_text) < 200)`)
  console.log(`\nPages vides/< 200 chars (à reset) : ${tooShort.rows[0].n}`)

  // Pages avec contenu > 1000 chars (potentiellement à réindexer)
  const hasContent = await pool.query(`
    SELECT COUNT(*) n FROM web_pages
    WHERE is_indexed = true AND knowledge_base_id IS NULL
      AND LENGTH(extracted_text) >= 1000`)
  console.log(`Pages avec contenu >= 1000 chars   : ${hasContent.rows[0].n}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
