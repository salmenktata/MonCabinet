#!/usr/bin/env tsx
/**
 * Drain tous les docs google_drive restants → doctrine (par batch de 50)
 * Usage: npx tsx scripts/_drain-gdrive.ts
 */
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: 'postgresql://moncabinet:prod_secure_password_2026@127.0.0.1:5434/qadhya',
  max: 3
})

const BATCH_SIZE = 50

async function main() {
  let total = 0
  let iteration = 0

  while (true) {
    iteration++
    const now = new Date().toISOString()

    // Récupérer un batch de docs google_drive
    const select = await pool.query(`
      SELECT id, LEFT(title, 60) as title FROM knowledge_base
      WHERE category = 'google_drive' AND is_active = true
      ORDER BY created_at DESC LIMIT $1
    `, [BATCH_SIZE])

    if (select.rows.length === 0) break

    const ids = select.rows.map(r => r.id)

    // Mettre à jour en doctrine
    const update = await pool.query(`
      UPDATE knowledge_base SET
        category = 'doctrine',
        doc_type = 'DOCTRINE',
        metadata = COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object('doc_type', 'DOCTRINE', 'old_category', 'google_drive', 'reclassified_at', $1::text),
        updated_at = NOW()
      WHERE id = ANY($2::uuid[])
    `, [now, ids])

    total += update.rowCount ?? 0

    // Afficher progression
    const remaining = await pool.query(
      `SELECT COUNT(*) FROM knowledge_base WHERE category = 'google_drive' AND is_active = true`
    )
    console.log(`Batch ${iteration}: ${update.rowCount} docs → doctrine | Restants: ${remaining.rows[0].count}`)

    if (select.rows.length < BATCH_SIZE) break
  }

  // Sync chunks (une seule fois à la fin)
  const sync = await pool.query(`
    UPDATE knowledge_base_chunks kbc
    SET metadata = kbc.metadata || jsonb_build_object('doc_type', 'DOCTRINE')
    FROM knowledge_base kb
    WHERE kbc.knowledge_base_id = kb.id
      AND kb.category = 'doctrine'
      AND kb.doc_type = 'DOCTRINE'
      AND kb.metadata->>'old_category' = 'google_drive'
      AND kb.is_active = true
      AND kbc.metadata->>'doc_type' IS DISTINCT FROM 'DOCTRINE'
  `)

  console.log(`\nTotal reclassifiés: ${total}`)
  console.log(`Chunks synced: ${sync.rowCount}`)
  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
