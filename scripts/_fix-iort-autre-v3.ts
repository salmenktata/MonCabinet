#!/usr/bin/env tsx
/**
 * Fix IORT autre v3 — version corrigée de _fix-iort-autre.ts et _fix-iort-autre2.ts
 *
 * Corrections vs v1/v2 :
 *   - مرسوم → norm_level='marsoum' (pas 'decret_presidentiel' deprecated)
 *   - أمر → norm_level='ordre_reglementaire' (pas 'decret_presidentiel' deprecated)
 *   - Reste IORT autre → jort + loi_ordinaire (pas doctrine)
 *   - Normalisation kashida via regexp_replace(title, chr(1600), '', 'g')
 *
 * Connexion via tunnel SSH : npm run tunnel:start (port 5434)
 */
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3,
})

async function main() {
  const before = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
  `)
  console.log(`AVANT: ${before.rows[0].count} docs IORT category='autre'\n`)

  // 1. قانون أساسي → legislation + loi_organique
  const fix1 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'loi_organique',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_organique',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%قانون أساسي%'
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`قانون أساسي → loi_organique: ${fix1.rowCount}`)
  for (const r of fix1.rows) console.log(`  ${r.title}`)

  // 2. قانون عدد → legislation + loi_ordinaire
  const fix2 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_ordinaire',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%قانون عدد%'
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nقانون عدد → loi_ordinaire: ${fix2.rowCount}`)
  for (const r of fix2.rows) console.log(`  ${r.title}`)

  // 3. مرسوم → legislation + marsoum (FIX: v1/v2 utilisaient decret_presidentiel)
  const fix3 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'marsoum',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'marsoum',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%مرسوم%'
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nمرسوم → marsoum: ${fix3.rowCount}`)
  for (const r of fix3.rows) console.log(`  ${r.title}`)

  // 4. أمر عدد / رئاسي / حكومي → legislation + ordre_reglementaire (FIX: v1/v2 utilisaient decret_presidentiel)
  const fix4 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'ordre_reglementaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'ordre_reglementaire',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND (
        regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%أمر عدد%'
        OR regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%أمر رئاسي%'
        OR regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%أمر حكومي%'
      )
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nأمر → ordre_reglementaire: ${fix4.rowCount}`)
  for (const r of fix4.rows) console.log(`  ${r.title}`)

  // 5. قرار → legislation + arrete_ministeriel
  const fix5 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation', doc_type = 'TEXTES', norm_level = 'arrete_ministeriel',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'arrete_ministeriel',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%قرار%'
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nقرار → arrete_ministeriel: ${fix5.rowCount}`)
  for (const r of fix5.rows) console.log(`  ${r.title}`)

  // 6. إصلاح خطأ (corrections JORT) → jort + loi_ordinaire
  const fix6 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'jort', doc_type = 'TEXTES', norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_ordinaire',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
      AND regexp_replace(title, chr(1600)::text, '', 'g') ILIKE '%إصلاح خطأ%'
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nإصلاح خطأ → jort: ${fix6.rowCount}`)
  for (const r of fix6.rows) console.log(`  ${r.title}`)

  // 7. Reste IORT autre non matché → jort + loi_ordinaire (pas doctrine)
  const fix7 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'jort', doc_type = 'TEXTES', norm_level = 'loi_ordinaire',
      metadata = metadata || jsonb_build_object(
        'doc_type', 'TEXTES', 'norm_level', 'loi_ordinaire',
        'old_category', 'autre', 'reclassified_at', NOW()::text, 'reclassify_reason', 'iort_autre_v3_reste'
      ), updated_at = NOW()
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
    RETURNING id, LEFT(title, 60) as title
  `)
  console.log(`\nReste IORT autre → jort: ${fix7.rowCount}`)
  for (const r of fix7.rows) console.log(`  ${r.title}`)

  // 8. Sync chunks (doc_type + norm_level + category dans metadata)
  console.log('\n=== SYNC CHUNKS ===')
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
      AND kb.metadata->>'reclassify_reason' IN ('iort_autre_v3', 'iort_autre_v3_reste')
      AND (
        kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
        OR kbc.metadata->>'norm_level' IS DISTINCT FROM kb.norm_level::text
        OR kbc.metadata->>'category' IS DISTINCT FROM kb.category::text
      )
  `)
  console.log(`  ${sync.rowCount} chunks mis à jour`)

  const after = await pool.query(`
    SELECT COUNT(*) FROM knowledge_base
    WHERE metadata->>'sourceOrigin' = 'iort_gov_tn'
      AND category = 'autre' AND is_active = true
  `)
  console.log(`\nAPRÈS: ${after.rows[0].count} docs IORT category='autre' (doit = 0)`)

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
