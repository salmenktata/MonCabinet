import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

// Supprime le kashida (U+0640) pour normaliser le matching
// On utilise regexp_replace côté SQL

async function main() {
  const before = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true`)
  console.log(`AVANT: ${before.rows[0].count} docs IORT 'autre'`)

  // 1. قانون أساسي (avec kashida) → loi_organique
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'loi_organique',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_organique',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_fix2'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600), '', 'g') ILIKE '%قانون أساسي%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقانون أساسي (kashida) → loi_organique: ${fix1.rowCount}`)
  for (const r of fix1.rows) console.log(`  ${r.title}`)

  // 2. قانون عدد (avec kashida) → loi_ordinaire
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_ordinaire',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_fix2'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600), '', 'g') ILIKE '%قانون عدد%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقانون عدد (kashida) → loi_ordinaire: ${fix2.rowCount}`)
  for (const r of fix2.rows) console.log(`  ${r.title}`)

  // 3. قرار (avec diacritics/kashida) → arrete_ministeriel
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'arrete_ministeriel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'arrete_ministeriel',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_fix2'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600), '', 'g') ILIKE '%قرار%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقرار (kashida) → arrete_ministeriel: ${fix3.rowCount}`)
  for (const r of fix3.rows) console.log(`  ${r.title}`)

  // 4. مرسوم (kashida) → decret_presidentiel
  const fix4 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'decret_presidentiel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'decret_presidentiel',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_fix2'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600), '', 'g') ILIKE '%مرسوم%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nمرسوم (kashida) → decret_presidentiel: ${fix4.rowCount}`)
  for (const r of fix4.rows) console.log(`  ${r.title}`)

  // 5. قائمة / محضر / reste → doctrine (documents admin internes)
  const fix5 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'doctrine', doc_type = 'DOCTRINE',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'DOCTRINE',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_fix2'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nReste → doctrine: ${fix5.rowCount}`)
  for (const r of fix5.rows) console.log(`  ${r.title}`)

  // Sync chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object(
      'doc_type', kb.doc_type::text,
      'norm_level', kb.norm_level::text,
      'category', kb.category::text
    )
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kb.metadata->>'reclassify_reason' = 'iort_autre_fix2'
      AND (
        kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
        OR kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text
      )`)
  console.log(`\nChunks synced: ${sync.rowCount}`)

  const after = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true`)
  console.log(`\nAPRÈS: ${after.rows[0].count} docs IORT 'autre'`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
