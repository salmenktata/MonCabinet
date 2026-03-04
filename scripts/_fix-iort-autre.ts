import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  // Audit avant
  const before = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true`)
  console.log(`AVANT: ${before.rows[0].count} docs IORT avec category='autre'`)

  // 1. إصلاح خطأ (corrections JORT) → jort + loi_ordinaire
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'jort',
      doc_type = 'TEXTES',
      norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'loi_ordinaire',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND title ILIKE '%إصلاح خطأ%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nإصلاح خطأ → jort: ${fix1.rowCount}`)
  for (const r of fix1.rows) console.log(`  ${r.title}`)

  // 2. قانون أساسي (lois organiques) → legislation + loi_organique
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      norm_level = 'loi_organique',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'loi_organique',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND (title ILIKE '%قانون أساسي%' OR title ILIKE '%قانون اساسي%')
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقانون أساسي → loi_organique: ${fix2.rowCount}`)
  for (const r of fix2.rows) console.log(`  ${r.title}`)

  // 3. قانون عدد (lois ordinaires) → legislation + loi_ordinaire
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'loi_ordinaire',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND title ILIKE '%قانون عدد%'
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقانون عدد → loi_ordinaire: ${fix3.rowCount}`)
  for (const r of fix3.rows) console.log(`  ${r.title}`)

  // 4. مرسوم بقانون / مرسوم عدد (décrets-lois) → legislation + decret_presidentiel
  const fix4 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      norm_level = 'decret_presidentiel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'decret_presidentiel',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND (title ILIKE '%مرسوم بقانون%' OR title ILIKE '%مرسوم عدد%')
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nمرسوم → decret_presidentiel: ${fix4.rowCount}`)
  for (const r of fix4.rows) console.log(`  ${r.title}`)

  // 5. أمر عدد / أمر رئاسي (ordres présidentiels) → legislation + decret_presidentiel
  const fix5 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      norm_level = 'decret_presidentiel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'decret_presidentiel',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND (title ILIKE '%أمر عدد%' OR title ILIKE '%أمر رئاسي%' OR title ILIKE '%أمر حكومي%')
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nأمر → decret_presidentiel: ${fix5.rowCount}`)
  for (const r of fix5.rows) console.log(`  ${r.title}`)

  // 6. قرار (arrêtés ministériels) → legislation + arrete_ministeriel
  const fix6 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      norm_level = 'arrete_ministeriel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES',
        'norm_level', 'arrete_ministeriel',
        'old_category', 'autre',
        'reclassified_at', NOW()::text,
        'reclassify_reason', 'iort_autre_fix'
      ),
      updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND (title ILIKE '%قرار%' OR title ILIKE '%قرار من وزير%' OR title ILIKE '%قرار مشترك%')
    RETURNING id, LEFT(title,60) as title`)
  console.log(`\nقرار → arrete_ministeriel: ${fix6.rowCount}`)
  for (const r of fix6.rows) console.log(`  ${r.title}`)

  // 7. Reste 'autre' IORT non matché → voir ce qu'il reste
  const remaining = await pool.query(`
    SELECT LEFT(title, 80) as title, norm_level
    FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
    LIMIT 30`)
  console.log(`\n=== Docs IORT 'autre' restants: ${remaining.rows.length} ===`)
  for (const r of remaining.rows) console.log(`  ${r.title}`)

  // 8. Sync chunks
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
      AND kb.metadata->>'reclassify_reason' = 'iort_autre_fix'
      AND (
        kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
        OR kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text
      )`)
  console.log(`\nChunks synced: ${sync.rowCount}`)

  // 9. État final
  const after = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true`)
  console.log(`\nAPRÈS: ${after.rows[0].count} docs IORT avec category='autre'`)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
