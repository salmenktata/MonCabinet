#!/usr/bin/env tsx
import { Pool } from 'pg'
const pool = new Pool({ connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya', max: 3 })

async function main() {
  const now = new Date().toISOString()

  // 1. Constitution
  const r1 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'constitution',
      doc_type = 'TEXTES',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('doc_type','TEXTES','old_category','google_drive','reclassified_at',$1::text),
      updated_at = NOW()
    WHERE category = 'google_drive' AND is_active = true
      AND title ILIKE '%دستور الجمهورية التونسية%'
    RETURNING id`, [now])
  console.log('Constitution:', r1.rowCount)

  // 2. Loi organique 50/2018 anti-discrimination
  const r2 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'legislation',
      doc_type = 'TEXTES',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('doc_type','TEXTES','old_category','google_drive','reclassified_at',$1::text),
      updated_at = NOW()
    WHERE category = 'google_drive' AND is_active = true
      AND title ILIKE '%قانون أساسي عدد 50 لسنة 2018%'
    RETURNING id`, [now])
  console.log('Legislation:', r2.rowCount)

  // 3. Doctrine: remaining 28 docs at offset 540
  const r3 = await pool.query(`
    UPDATE knowledge_base SET
      category = 'doctrine',
      doc_type = 'DOCTRINE',
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('doc_type','DOCTRINE','old_category','google_drive','reclassified_at',$1::text),
      updated_at = NOW()
    WHERE id IN (
      SELECT id FROM knowledge_base
      WHERE category = 'google_drive' AND is_active = true
      ORDER BY created_at DESC
      OFFSET 540 LIMIT 30
    )
    RETURNING id`, [now])
  console.log('Doctrine:', r3.rowCount)

  // Sync chunks
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('doc_type', kb.doc_type::text)
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.is_active = true
      AND kbc.metadata->>'doc_type' IS DISTINCT FROM kb.doc_type::text
      AND kb.id IN (
        SELECT id FROM knowledge_base
        WHERE category IN ('constitution','legislation','doctrine')
          AND metadata->>'old_category' = 'google_drive'
          AND metadata->>'reclassified_at' = $1::text
      )`, [now])
  console.log('Chunks synced:', sync.rowCount)

  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
