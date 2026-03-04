import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  const before = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base WHERE is_active=true AND metadata->>'sourceOrigin' IS NULL`)
  console.log(`AVANT: ${before.rows[0].count} docs sans sourceOrigin`)

  // 1. Docs liés à web_pages → déduire depuis base_url du web_source
  const fix1 = await pool.query(`
    UPDATE knowledge_base kb
    SET metadata = kb.metadata || jsonb_build_object('sourceOrigin',
      CASE
        WHEN ws.base_url ILIKE '%iort.gov.tn%'      THEN 'iort_gov_tn'
        WHEN ws.base_url ILIKE '%9anoun.tn%'         THEN '9anoun_tn'
        WHEN ws.base_url ILIKE '%cassation.tn%'      THEN 'cassation_tn'
        WHEN ws.base_url ILIKE '%justice.gov.tn%'    THEN 'justice_gov_tn'
        WHEN ws.base_url ILIKE '%legislation.tn%'    THEN 'legislation_tn'
        ELSE 'autre'
      END
    ), updated_at = NOW()
    FROM web_pages wp
    JOIN web_sources ws ON ws.id = wp.web_source_id
    WHERE kb.id = wp.knowledge_base_id
      AND kb.is_active = true
      AND kb.metadata->>'sourceOrigin' IS NULL
    RETURNING kb.id`)
  console.log(`Via web_pages → web_sources: ${fix1.rowCount} docs`)

  // 3. Docs Google Drive reclassifiés (old_category = 'google_drive' dans metadata)
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET
      metadata = metadata || jsonb_build_object('sourceOrigin', 'google_drive'),
      updated_at = NOW()
    WHERE is_active = true
      AND metadata->>'sourceOrigin' IS NULL
      AND metadata->>'old_category' = 'google_drive'
    RETURNING id`)
  console.log(`Google Drive (old_category): ${fix3.rowCount} docs`)

  // 4. Docs IORT par category/subcategory (PDFs IORT indexés sans web_pages)
  const fix4 = await pool.query(`
    UPDATE knowledge_base SET
      metadata = metadata || jsonb_build_object('sourceOrigin', 'iort_gov_tn'),
      updated_at = NOW()
    WHERE is_active = true
      AND metadata->>'sourceOrigin' IS NULL
      AND category IN ('jort','constitution')
    RETURNING id`)
  console.log(`IORT (jort/constitution category): ${fix4.rowCount} docs`)

  // 5. Reste non identifiable → 'autre'
  const fix5 = await pool.query(`
    UPDATE knowledge_base SET
      metadata = metadata || jsonb_build_object('sourceOrigin', 'autre'),
      updated_at = NOW()
    WHERE is_active = true AND metadata->>'sourceOrigin' IS NULL
    RETURNING id`)
  console.log(`Reste → 'autre': ${fix5.rowCount} docs`)

  // Sync vers chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object(
      'sourceOrigin', kb.metadata->>'sourceOrigin'
    )
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kbc.metadata->>'sourceOrigin' IS DISTINCT FROM kb.metadata->>'sourceOrigin'`)
  console.log(`\nChunks sourceOrigin synced: ${sync.rowCount}`)

  // Vérification finale
  const after = await pool.query(`
    SELECT metadata->>'sourceOrigin' as origin, COUNT(*) n
    FROM knowledge_base WHERE is_active=true
    GROUP BY origin ORDER BY n DESC`)
  console.log('\n=== Distribution sourceOrigin finale ===')
  for (const r of after.rows)
    console.log(`  ${(r.origin||'NULL').padEnd(20)} : ${r.n}`)

  const nullLeft = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base WHERE is_active=true AND metadata->>'sourceOrigin' IS NULL`)
  console.log(`\nSans sourceOrigin restants: ${nullLeft.rows[0].count}`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
